using System.Net;
using System.Text;
using System.Text.Json;

namespace Protest.Tests;

using Ares = global::Protest.Ares.Core;

public class AresPersonaTests {
    [TestCase("openai", false)]
    [TestCase("openai", true)]
    [TestCase("anthropic", false)]
    [TestCase("anthropic", true)]
    [TestCase("xai", false)]
    [TestCase("xai", true)]
    [TestCase("google", false)]
    [TestCase("google", true)]
    [TestCase("ollama", false)]
    [TestCase("ollama", true)]
    public async Task EveryTurnIncludesOnePersonaAndPreservesTheConversation(string provider, bool streaming) {
        Ares.Message[] firstTurn = [new Ares.Message("user", "First question")];
        Ares.Message[] followup = [..firstTurn, new Ares.Message("assistant", "First answer"), new Ares.Message("user", "Next question")];
        int requests = 0;
        using HttpClient client = new HttpClient(new Handler(request => {
            Ares.Message[] expected = requests == 0 ? firstTurn : followup;
            requests++;
            using JsonDocument json = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            JsonElement body = json.RootElement;
            JsonElement[] messages = body.GetProperty("messages").EnumerateArray().ToArray();
            int offset = provider == "anthropic" ? 0 : 1;
            Assert.Multiple(() => {
                Assert.That(Ares.PERSONA, Does.Contain("You are A.R.E.S.").And.Contain("Autonomous Remote Execution System"));
                Assert.That(body.GetProperty("stream").GetBoolean(), Is.EqualTo(streaming));
                Assert.That(messages.Length, Is.EqualTo(expected.Length + offset));
                Assert.That(messages.Skip(offset).Select(message => message.GetProperty("role").GetString()), Is.EqualTo(expected.Select(message => message.Role)));
                Assert.That(messages.Skip(offset).Select(message => message.GetProperty("content").GetString()), Is.EqualTo(expected.Select(message => message.Content)));
            });

            if (provider == "anthropic") {
                Assert.Multiple(() => {
                    Assert.That(body.GetProperty("system").GetString(), Is.EqualTo(Ares.PERSONA));
                    Assert.That(messages.Any(message => message.GetProperty("content").GetString() == Ares.PERSONA), Is.False);
                });
            }
            else {
                Assert.Multiple(() => {
                    Assert.That(body.TryGetProperty("system", out _), Is.False);
                    Assert.That(messages[0].GetProperty("role").GetString(), Is.EqualTo(provider == "openai" ? "developer" : "system"));
                    Assert.That(messages[0].GetProperty("content").GetString(), Is.EqualTo(Ares.PERSONA));
                    Assert.That(messages.Count(message => message.GetProperty("content").GetString() == Ares.PERSONA), Is.EqualTo(1));
                });
            }

            return Response(provider, streaming);
        }));

        List<string> deltas = new List<string>();
        Func<string, Task>? onText = streaming ? text => {
            deltas.Add(text);
            return Task.CompletedTask;
        } : null;
        foreach (Ares.Message[] conversation in new[] { firstTurn, followup, followup }) {
            string answer = await Ares.FetchReplyAsync(provider, "test-key", "selected-model", conversation, client, onText: onText!);
            Assert.That(answer, Is.EqualTo("Answer"));
        }

        Assert.Multiple(() => {
            Assert.That(requests, Is.EqualTo(3));
            Assert.That(firstTurn.Select(message => message.Role), Is.EqualTo(new[] { "user" }));
            Assert.That(followup.Select(message => message.Role), Is.EqualTo(new[] { "user", "assistant", "user" }));
            Assert.That(followup.Select(message => message.Content), Is.EqualTo(new[] { "First question", "First answer", "Next question" }));
            Assert.That(deltas, Is.EqualTo(streaming ? new[] { "Answer", "Answer", "Answer" } : Array.Empty<string>()));
        });
    }

    [TestCase("gpt-6.2-sol", "developer")]
    [TestCase("gpt-5.4", "developer")]
    [TestCase("gpt-4.1-mini-2025-04-14", "developer")]
    [TestCase("o1-2024-12-17", "developer")]
    [TestCase("o3-mini", "developer")]
    [TestCase("chat-latest", "developer")]
    [TestCase("gpt-4", "system")]
    [TestCase("gpt-4-turbo", "system")]
    [TestCase("gpt-4o-2024-08-06", "system")]
    [TestCase("gpt-3.5-turbo", "system")]
    [TestCase("ft:gpt-4o-2024-08-06:organization:custom:id", "system")]
    [TestCase("ft:gpt-4.1-mini-2025-04-14:organization:custom:id", "developer")]
    [TestCase("o1-mini", "user")]
    [TestCase("o1-preview-2024-09-12", "user")]
    public async Task OpenAiPersonaUsesAnInstructionRoleSupportedByTheModel(string model, string role) {
        using HttpClient client = new HttpClient(new Handler(request => {
            using JsonDocument json = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            JsonElement[] messages = json.RootElement.GetProperty("messages").EnumerateArray().ToArray();
            Assert.Multiple(() => {
                Assert.That(json.RootElement.GetProperty("model").GetString(), Is.EqualTo(model));
                Assert.That(messages.Length, Is.EqualTo(2));
                Assert.That(messages[0].GetProperty("role").GetString(), Is.EqualTo(role));
                Assert.That(messages[0].GetProperty("content").GetString(), Is.EqualTo(Ares.PERSONA));
                Assert.That(messages[1].GetProperty("role").GetString(), Is.EqualTo("user"));
                Assert.That(messages[1].GetProperty("content").GetString(), Is.EqualTo("Question"));
            });
            return Response("openai", false);
        }));
        Assert.That(await Ares.FetchReplyAsync("openai", "test-key", model, [new Ares.Message("user", "Question")], client), Is.EqualTo("Answer"));
    }

    private static string Response(string provider, bool streaming) {
        if (streaming) {
            return provider switch {
                "anthropic" => "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Answer\"}}\n\ndata: {\"type\":\"message_stop\"}\n\n",
                "ollama" => "{\"message\":{\"content\":\"Answer\"},\"done\":true}\n",
                _ => "data: {\"choices\":[{\"delta\":{\"content\":\"Answer\"}}]}\n\ndata: [DONE]\n\n"
            };
        }

        return provider switch {
            "anthropic" => """{"content":[{"type":"text","text":"Answer"}]}""",
            "ollama" => """{"message":{"content":"Answer"}}""",
            _ => """{"choices":[{"message":{"content":"Answer"}}]}"""
        };
    }

    private sealed class Handler(Func<HttpRequestMessage, string> respond) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
            string body = respond(request);
            HttpResponseMessage response = new HttpResponseMessage(HttpStatusCode.OK) {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }
}
