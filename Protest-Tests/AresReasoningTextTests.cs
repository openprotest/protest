using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Protest.Tests;

using Ares = global::Protest.Ares.Core;

public class AresReasoningTextTests {
    [TestCase("ollama", "thinking", false)]
    [TestCase("ollama", "thinking", true)]
    [TestCase("xai", "reasoning_content", false)]
    [TestCase("xai", "reasoning_content", true)]
    [TestCase("google", "reasoning", false)]
    [TestCase("google", "reasoning", true)]
    [TestCase("google", "reasoning_content", true)]
    [TestCase("openai", "thinking", true)]
    [TestCase("openai", "reasoning", false)]
    [TestCase("openai", "reasoning_content", true)]
    [TestCase("anthropic", "thinking", false)]
    [TestCase("anthropic", "thinking", true)]
    public async Task ReturnedReasoningStreamsSeparatelyFromTheAnswer(string provider, string field, bool streaming) {
        string wire;
        string expected = "Inspecting inputs.";
        string Event(object value) => "data: " + JsonSerializer.Serialize(value) + "\n\n";
        if (provider == "anthropic") {
            expected += "\n\nOther thought.";
            wire = streaming ?
                Event(new { type = "content_block_start", content_block = new { type = "thinking", thinking = "Inspecting " } }) +
                Event(new { type = "content_block_delta", delta = new { type = "thinking_delta", thinking = "inputs." } }) +
                Event(new { type = "content_block_delta", delta = new { type = "signature_delta", signature = "SIGNATURE" } }) +
                Event(new { type = "content_block_start", content_block = new { type = "redacted_thinking", data = "ENCRYPTED" } }) +
                Event(new { type = "content_block_start", content_block = new { type = "thinking", thinking = "Other thought." } }) +
                Event(new { type = "content_block_delta", delta = new { type = "text_delta", text = "Answer" } }) +
                Event(new { type = "message_stop" }) :
                """{"content":[{"type":"thinking","thinking":"Inspecting inputs.","signature":"SIGNATURE"},{"type":"redacted_thinking","data":"ENCRYPTED"},{"type":"thinking","thinking":"Other thought."},{"type":"text","text":"Answer"}]}""";
        }
        else {
            Dictionary<string, object> first = new Dictionary<string, object> { [field] = streaming ? "Inspecting " : expected, ["signature"] = "SIGNATURE", ["encrypted_content"] = "ENCRYPTED" };
            Dictionary<string, object> second = new Dictionary<string, object> { [field] = "inputs.", ["content"] = "Answer" };
            if (!streaming) first["content"] = "Answer";
            if (provider == "ollama") {
                wire = JsonSerializer.Serialize(new { message = first, done = !streaming }) + "\n";
                if (streaming) wire += JsonSerializer.Serialize(new { message = second, done = true }) + "\n";
            }
            else {
                wire = streaming ?
                    Event(new { choices = new[] { new { delta = first } } }) + Event(new { choices = new[] { new { delta = second } } }) + "data: [DONE]\n\n" :
                    JsonSerializer.Serialize(new { choices = new[] { new { message = first } } });
            }
        }

        using HttpClient client = new HttpClient(new Handler(wire));
        List<string> reasoning = new List<string>();
        List<string> answer = new List<string>();
        List<string> events = new List<string>();
        Func<string, Task>? onText = streaming ? text => {
            answer.Add(text);
            events.Add("answer");
            return Task.CompletedTask;
        } : null;
        string result = await Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new Ares.Message("user", "Question")], client, onText: onText!, onReasoning: text => {
            reasoning.Add(text);
            events.Add("reasoning");
            return Task.CompletedTask;
        });
        Assert.Multiple(() => {
            Assert.That(String.Concat(reasoning), Is.EqualTo(expected));
            Assert.That(result, Is.EqualTo("Answer"));
            Assert.That(answer, Is.EqualTo(streaming ? new[] { "Answer" } : Array.Empty<string>()));
            Assert.That(events[0], Is.EqualTo("reasoning"));
            Assert.That(String.Concat(reasoning), Does.Not.Contain("SIGNATURE").And.Not.Contain("ENCRYPTED"));
        });
    }

    [Test]
    public async Task NonTextAndEncryptedReasoningDoNotBecomeDisplayText() {
        string wire = """data: {"choices":[{"delta":{"thinking":false,"reasoning_content":{"encrypted_content":"SECRET"},"reasoning":[{"text":"SECRET"}],"reasoning_details":[{"data":"SECRET"}],"content":"Answer"}}]}""" + "\n\ndata: [DONE]\n\n";
        using HttpClient client = new HttpClient(new Handler(wire));
        List<string> reasoning = new List<string>();
        string answer = await Ares.FetchReplyAsync("openai", "test-key", "selected-model", [new Ares.Message("user", "Question")], client,
            onText: _ => Task.CompletedTask, onReasoning: text => {
                reasoning.Add(text);
                return Task.CompletedTask;
            });
        Assert.Multiple(() => {
            Assert.That(answer, Is.EqualTo("Answer"));
            Assert.That(reasoning, Is.Empty);
        });
    }

    [Test]
    public void ReasoningSurvivesHistoryAndBranchingButIsDiscardedForStoppedReplies() {
        string directory = Path.Combine(Path.GetTempPath(), "ares-reasoning-" + Guid.NewGuid());
        Ares.HistoryStore store = new Ares.HistoryStore(directory);
        try {
            Ares.HistoryTurn turn = store.Begin("alice", null!, 0, Guid.NewGuid().ToString(), "Question");
            store.AppendReasoning(turn, "First ");
            Ares.HistoryState snapshot = store.GetState("alice", turn.Conversation.Id);
            store.AppendReasoning(turn, "thought");
            Assert.Multiple(() => {
                Assert.That(snapshot.Pending.ReasoningText, Is.EqualTo("First "));
                Assert.That(store.GetState("alice", turn.Conversation.Id).Pending.ReasoningText, Is.EqualTo("First thought"));
                Assert.That(store.GetState("bob", turn.Conversation.Id), Is.Null);
                Assert.That(Directory.Exists(directory), Is.False);
            });
            Ares.Conversation saved = store.Complete(turn, "Answer", "completed", "a", "Agent", "ollama", "qwen3.5:4b", "true");
            store.Release(turn);
            Assert.Throws<InvalidOperationException>(() => store.AppendReasoning(turn, "Stale"));
            Ares.Conversation loaded = new Ares.HistoryStore(directory).Get("alice", saved.Id);
            Ares.Conversation branch = store.Branch("alice", saved.Id, turn.RequestId);
            Assert.Multiple(() => {
                Assert.That(loaded.Messages[0].ReasoningText, Is.Null);
                Assert.That(loaded.Messages[1].Content, Is.EqualTo("Answer"));
                Assert.That(loaded.Messages[1].ReasoningText, Is.EqualTo("First thought"));
                Assert.That(loaded.Messages[1].Reasoning, Is.EqualTo("true"));
                Assert.That(branch.Messages[1].ReasoningText, Is.EqualTo("First thought"));
            });
            Ares.HistoryTurn stopped = store.Begin("alice", saved.Id, saved.Revision, Guid.NewGuid().ToString(), "Stopped question");
            store.AppendReasoning(stopped, "DISCARD REASONING");
            store.Stop("alice", saved.Id, stopped.RequestId);
            saved = store.Complete(stopped, "DISCARD ANSWER", "completed", "a", "Agent", "ollama", "qwen3.5:4b", "true");
            store.Release(stopped);
            Assert.Multiple(() => {
                Assert.That(saved.Messages.Last().Role, Is.EqualTo("user"));
                Assert.That(saved.Messages.Last().Status, Is.EqualTo("interrupted"));
                Assert.That(saved.Messages.Last().ReasoningText, Is.Null);
                Assert.That(JsonSerializer.Serialize(saved), Does.Not.Contain("DISCARD"));
            });
            string file = Directory.GetFiles(directory, branch.Id + ".json", SearchOption.AllDirectories).Single();
            JsonNode old = JsonNode.Parse(File.ReadAllText(file))!;
            foreach (JsonNode? message in old["messages"]!.AsArray()) {
                message!.AsObject().Remove("reasoningText");
            }
            File.WriteAllText(file, old.ToJsonString());
            Assert.That(store.Get("alice", branch.Id).Messages[1].ReasoningText, Is.Null);
        }
        finally {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }

    private sealed class Handler(string body) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8) });
        }
    }
}
