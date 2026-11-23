using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Ares;

internal static partial class Core {
    private sealed record Agent(string Id, string Type, string Name, bool Enabled, string Secret, string Endpoint = null);
    internal sealed record Model(string Id, string Name);
    internal sealed record Message(string Role, string Content);

    private const int MAX_PAYLOAD = 64 * 1024;
    private const int MAX_CHAT_PAYLOAD = 1024 * 1024;
    private const int MAX_TEXT_LENGTH = 8192;
    private static readonly Lock mutex = new Lock();
    private static readonly Dictionary<string, string> errors = new Dictionary<string, string>();
    private static readonly string[] reasoningTextFields = ["thinking", "reasoning_content", "reasoning"];
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly HttpClient httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };

    private static string ProviderLabel(string type) => type switch {
        "openai"    => "OpenAI",
        "anthropic" => "Anthropic",
        "xai"       => "xAI",
        "google"    => "Google",
        "ollama"    => "Ollama",
        _ => null
    };

    public static byte[] GetTypes() => JsonSerializer.SerializeToUtf8Bytes(new[] {
        new { type = "openai",    label = "OpenAI/ChatGPT" },
        new { type = "anthropic", label = "Anthropic/Claude" },
        new { type = "xai",       label = "xAI/Grok" },
        new { type = "google",    label = "Google/Gemini" },
        new { type = "ollama",    label = "Ollama" }
    });

    public static byte[] List(bool enabledOnly = false) {
        lock (mutex) {
            return JsonSerializer.SerializeToUtf8Bytes(ReadAgents().Where(agent => !enabledOnly || agent.Enabled).Select(agent => new {
                id       = agent.Id,
                type     = agent.Type,
                label    = ProviderLabel(agent.Type),
                name     = agent.Name,
                enabled  = agent.Enabled,
                revision = Revision(agent),
                error    = errors.GetValueOrDefault(agent.Id)
            }).ToArray());
        }
    }

    public static byte[] Get(HttpListenerContext ctx) {
        lock (mutex) {
            Agent agent = ReadAgent(RequestId(ctx));
            if (agent is null) return Data.CODE_NOT_FOUND.Array;

            return JsonSerializer.SerializeToUtf8Bytes(new {
                id = agent.Id,
                type = agent.Type,
                name = agent.Name,
                enabled = agent.Enabled,
                endpoint = agent.Endpoint
            });
        }
    }

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using JsonDocument doc = ReadJsonBody(ctx);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return Data.CODE_INVALID_ARGUMENT.Array;
        JsonElement root = doc.RootElement;

        bool invalidId = root.TryGetProperty("id", out JsonElement idValue) && idValue.ValueKind is not (JsonValueKind.Null or JsonValueKind.String);
        bool invalidKey = root.TryGetProperty("key", out JsonElement keyValue) && keyValue.ValueKind != JsonValueKind.String;
        bool invalidEnabled = root.TryGetProperty("enabled", out JsonElement enabledValue) && enabledValue.ValueKind is not (JsonValueKind.True or JsonValueKind.False);
        bool invalidEndpoint = root.TryGetProperty("endpoint", out JsonElement endpointValue) && endpointValue.ValueKind is not (JsonValueKind.Null or JsonValueKind.String);
        if (invalidId || invalidKey || invalidEnabled || invalidEndpoint) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        lock (mutex) {
            string id = GetString(root, "id");
            Agent existing = null;
            if (!String.IsNullOrEmpty(id)) {
                if (!Guid.TryParse(id, out Guid guid)) return Data.CODE_INVALID_ARGUMENT.Array;
                existing = ReadAgent(guid.ToString());
                if (existing is null) return Data.CODE_NOT_FOUND.Array;
            }

            string type = existing?.Type ?? GetString(root, "type");
            if (ProviderLabel(type) is null) return Data.CODE_INVALID_ARGUMENT.Array;

            string name = (GetString(root, "name") ?? String.Empty).Trim();
            string key = (GetString(root, "key") ?? String.Empty).Trim();
            string endpoint = null;

            if (type == "ollama") {
                endpoint = NormalizeEndpoint(GetString(root, "endpoint") ?? existing?.Endpoint ?? "http://localhost:11434");
                if (endpoint is null) {
                    return Error("Enter a valid HTTP or HTTPS Ollama server URL without credentials, a query, or a fragment");
                }
            }

            bool enabled = root.TryGetProperty("enabled", out JsonElement flag) ? flag.ValueKind == JsonValueKind.True : existing?.Enabled ?? true;

            if (name.Length == 0 || name.Length > 64 || name.Any(Char.IsControl)) return Error("Enter a name of up to 64 characters without control characters");
            if (key.Length == 0 && existing is null && type != "ollama") return Error("An API key is required");
            if (key.Length > 512 || key.Any(character => character < '!' || character > '~')) return Error("The API key is not valid");
            if (ReadAgents().Any(agent => agent.Id != existing?.Id && String.Equals(agent.Name, name, StringComparison.OrdinalIgnoreCase))) {
                return Error("An agent with this name already exists");
            }

            try {
                string secret = key.Length == 0 ? existing?.Secret ?? String.Empty : Convert.ToBase64String(Cryptography.Encrypt(Encoding.UTF8.GetBytes(key), Configuration.DB_KEY, Configuration.DB_KEY_IV));
                Agent agent = new Agent(existing?.Id ?? Guid.NewGuid().ToString(), type, name, enabled, secret, endpoint);
                Directory.CreateDirectory(Data.DIR_ARES_AGENTS);

                string path = PathOf(agent.Id);
                string temporary = $"{path}.tmp";
                File.WriteAllBytes(temporary, JsonSerializer.SerializeToUtf8Bytes(agent, jsonOptions));
                File.Move(temporary, path, true);
                errors.Remove(agent.Id);

                Logger.Action(origin, "A.R.E.S.", $"{(existing is null ? "Add" : "Modify")} {ProviderLabel(type)} agent: {name}");
                return JsonSerializer.SerializeToUtf8Bytes(new { status = "ok", id = agent.Id });
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Data.CODE_FAILED.Array;
            }
        }
    }

    public static byte[] Delete(HttpListenerContext ctx, string origin) {
        lock (mutex) {
            Agent agent = ReadAgent(RequestId(ctx));
            if (agent is null) return Data.CODE_NOT_FOUND.Array;

            try {
                File.Delete(PathOf(agent.Id));
                errors.Remove(agent.Id);
                Logger.Action(origin, "A.R.E.S.", $"Delete {ProviderLabel(agent.Type)} agent: {agent.Name}");
                return Data.CODE_OK.Array;
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Data.CODE_FAILED.Array;
            }
        }
    }

    public static Task<byte[]> TestAsync(HttpListenerContext ctx, string origin) => GetModelsAsync(ctx, origin, true);

    public static async Task<byte[]> GetModelsAsync(HttpListenerContext ctx, string origin, bool test = false) {
        Agent agent;
        lock (mutex) {
            agent = ReadAgent(RequestId(ctx));
        }

        if (agent is null) return Data.CODE_NOT_FOUND.Array;
        if (!test && !agent.Enabled) return Error("The selected agent is disabled. Select an enabled agent.");

        string error = null;
        Model[] models = [];
        string[] reasoning = [];
        bool reasoningLoaded = false;
        try {
            using CancellationTokenSource timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            string key = ReadKey(agent);
            models = await FetchModelsAsync(agent.Type, key, httpClient, timeout.Token, agent.Endpoint);

            if (models.Length == 0) error = "The provider returned no available models";
            string selectedModel = ctx.Request.QueryString["model"];

            if (!test && models.Any(model => model.Id == selectedModel)) {
                try {
                    reasoning = await FetchReasoningOptionsAsync(agent.Type, key, selectedModel, httpClient, timeout.Token, agent.Endpoint);
                    reasoningLoaded = true;
                }
                catch (Exception ex) when (ex is HttpRequestException or JsonException or OperationCanceledException) {
                    //Optional metadata is unavailable. Allow Default and retry on the next load.
                }
            }
        }
        catch (HttpRequestException ex) {
            error = ex.StatusCode is null
                ? $"Cannot connect to {ProviderLabel(agent.Type)}"
                : agent.Type == "ollama" ? $"Ollama rejected the models request (HTTP {(int)ex.StatusCode}). Check the server URL and access settings."
                : $"{ProviderLabel(agent.Type)} rejected the models request (HTTP {(int)ex.StatusCode}). Check the API key, permissions, and rate limits.";
        }
        catch (OperationCanceledException) {
            error = $"The request to {ProviderLabel(agent.Type)} timed out";
        }
        catch (Exception ex) {
            Logger.Error(ex);
            error = "Unable to load models from this agent";
        }

        lock (mutex) {
            //Ignore results from requests that started before the agent was edited or removed.
            if (ReadAgent(agent.Id) != agent) return Error("The agent configuration changed. Refresh the agent list.");
            if (error is null) errors.Remove(agent.Id);
            else errors[agent.Id] = error;
        }

        if (test) Logger.Action(origin, "A.R.E.S.", $"Test {ProviderLabel(agent.Type)} agent: {agent.Name} ({(error is null ? "succeeded" : "failed")})");
        if (error is not null) return Error(error);
        if (test) return Data.CODE_OK.Array;

        return JsonSerializer.SerializeToUtf8Bytes(new {
            agent = new { id = agent.Id, type = agent.Type, name = agent.Name, label = ProviderLabel(agent.Type) },
            revision = Revision(agent),
            reasoning,
            reasoningLoaded,
            models = models.Select(model => new { id = model.Id, name = model.Name }).ToArray()
        });
    }

    public static async Task<byte[]> ChatAsync(HttpListenerContext ctx) {
        using JsonDocument doc = ReadJsonBody(ctx, MAX_CHAT_PAYLOAD);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return Data.CODE_INVALID_ARGUMENT.Array;

        JsonElement root = doc.RootElement;
        string model = GetString(root, "model");
        string text = GetString(root, "text");

        //Older clients may start a new conversation with one user message, never supply saved history.
        if (text is null && ReadMessages(root) is Message[] legacy && legacy.Length == 1) text = legacy[0].Content;
        if (String.IsNullOrWhiteSpace(model) || model.Length > 256 || model.Any(Char.IsControl) || String.IsNullOrWhiteSpace(text) || text.Length > MAX_TEXT_LENGTH) {
            return Error("Enter a text message of up to 8192 characters.");
        }

        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;

        string conversationId = GetString(root, "conversationId");
        string requestId = GetString(root, "requestId") ?? Guid.NewGuid().ToString();
        int conversationRevision = 0;

        if ((root.TryGetProperty("conversationId", out JsonElement conversationValue) && conversationValue.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) ||
            (conversationId is not null && !Guid.TryParse(conversationId, out _)) || !Guid.TryParse(requestId, out _) ||
            (root.TryGetProperty("requestId", out JsonElement requestValue) && requestValue.ValueKind != JsonValueKind.String) ||
            (root.TryGetProperty("conversationRevision", out JsonElement revisionValue) && (revisionValue.ValueKind != JsonValueKind.Number || !revisionValue.TryGetInt32(out conversationRevision)))) return Data.CODE_INVALID_ARGUMENT.Array;

        Agent agent;
        lock (mutex) {
            agent = ReadAgent(RequestId(ctx));
        }

        if (agent is null) return Data.CODE_NOT_FOUND.Array;

        if (!agent.Enabled) {
            return Error("The selected agent is disabled. Reopen A.R.E.S. and select an enabled agent.");
        }

        if (GetString(root, "revision") != Revision(agent)) {
            return Error("The agent settings changed. Reopen A.R.E.S. and confirm your selection.");
        }

        string reasoning = GetString(root, "reasoning");
        if (root.TryGetProperty("reasoning", out JsonElement reasoningValue) && reasoningValue.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) return Data.CODE_INVALID_ARGUMENT.Array;
        if (reasoning?.Length > 64 || reasoning?.Any(Char.IsControl) == true) return Data.CODE_INVALID_ARGUMENT.Array;

        HistoryTurn turn;
        Message[] messages;
        try {
            turn = history.Begin(owner, conversationId, conversationRevision, requestId, text, agent.Id, agent.Name, model, reasoning);
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException) {
            return Error(ex.Message);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Error("Unable to open conversation history");
        }

        List<Message> context = new List<Message>();
        for (int i = 0; i + 1 < turn.Conversation.Messages.Length; i++) {
            if (turn.Conversation.Messages[i].Role != "user" || turn.Conversation.Messages[i].Status != "completed" || turn.Conversation.Messages[i + 1].Role != "assistant" || turn.Conversation.Messages[i + 1].Status != "completed") continue;
            context.Add(new Message("user", turn.Conversation.Messages[i].Content));
            context.Add(new Message("assistant", turn.Conversation.Messages[++i].Content));
        }

        context.Add(new Message("user", text));
        messages = context.ToArray();

        if (JsonSerializer.SerializeToUtf8Bytes(messages, jsonOptions).Length > MAX_CHAT_PAYLOAD) {
            history.Release(turn);
            return Error("This conversation is too long. Start a new conversation.");
        }

        ctx.Response.ContentType = "application/x-ndjson; charset=utf-8";
        ctx.Response.SendChunked = true;
        ctx.Response.AddHeader("X-Accel-Buffering", "no");

        CancellationToken generation = turn.Generation.Token;

        StringBuilder reply = turn.Response;
        string error = null;
        bool complete = false;
        bool connected = true;
        bool refreshOptions = false;

        async Task SendEvent(object value, CancellationToken token = default) {
            if (!connected) return;

            try {
                await WriteChatEventAsync(ctx, value, token);
            }
            catch (HttpListenerException) {
                connected = false;
            }
            catch (IOException) {
                connected = false;
            }
            catch (ObjectDisposedException) {
                connected = false;
            }
        }

        try {
            await SendEvent(new { type = "accepted", conversationId = turn.Conversation.Id, conversationRevision = turn.Conversation.Revision, requestId = turn.RequestId }, generation);
            if (!String.IsNullOrEmpty(reasoning)) {
                try {
                    using CancellationTokenSource validation = CancellationTokenSource.CreateLinkedTokenSource(generation);
                    validation.CancelAfter(TimeSpan.FromSeconds(30));

                    string[] options = await FetchReasoningOptionsAsync(agent.Type, ReadKey(agent), model, httpClient, validation.Token, agent.Endpoint);
                    if (!options.Contains(reasoning)) {
                        refreshOptions = true;
                        error = "The selected reasoning level is unavailable for this model. Reopen the model menu to refresh the options.";
                    }
                }
                catch (Exception ex) when (ex is HttpRequestException or JsonException or OperationCanceledException) {
                    error = "Unable to verify this model's reasoning settings. Select Default or try again.";
                }

                if (error is not null) {
                    throw new InvalidOperationException(error);
                }
            }

            bool current;
            lock (mutex) {
                current = ReadAgent(agent.Id) == agent;
            }

            if (!current || !Auth.IsAuthorized(ctx, "/ares/chat")) {
                throw new InvalidOperationException("The agent settings or your access changed. Reopen A.R.E.S.");
            }

            await FetchReplyAsync(agent.Type, ReadKey(agent), model, messages, httpClient, generation, agent.Endpoint, async delta => {
                history.Append(turn, delta);
                await SendEvent(new { type = "delta", text = delta }, generation);
            }, reasoning, onReasoning: async delta => {
                history.AppendReasoning(turn, delta);
                await SendEvent(new { type = "reasoning", text = delta }, generation);
            });

            lock (mutex) {
                current = ReadAgent(agent.Id) == agent;
            }

            if (!current) {
                throw new InvalidOperationException("The agent settings changed. Reopen A.R.E.S. and confirm your selection.");
            }

            complete = true;
        }
        catch (InvalidOperationException ex) {
            error = ex.Message;
        }
        catch (HttpRequestException ex) {
            refreshOptions = ex.StatusCode == HttpStatusCode.NotFound;
            error = ex.StatusCode is null ? $"Cannot connect to {ProviderLabel(agent.Type)}" : ex.Message;
        }
        catch (OperationCanceledException) {
            error = $"The request to {ProviderLabel(agent.Type)} timed out";
        }
        catch (JsonException) {
            error = $"{ProviderLabel(agent.Type)} returned an invalid, interrupted, or empty text response for the selected model";
        }
        catch (HttpListenerException) {
            error = "The response was interrupted because the browser disconnected.";
        }
        catch (IOException) {
            error = $"The response from {ProviderLabel(agent.Type)} was interrupted. Try again.";
        }
        catch (Exception ex) {
            Logger.Error(ex);
            error = "Unable to get a response from this agent";
        }

        Conversation saved = null;
        try {
            saved = history.Complete(turn, reply.ToString(), complete ? "completed" : "interrupted", agent.Id, agent.Name, agent.Type, model, reasoning, error);
            complete = saved.Messages[^1].Status == "completed";
            if (!complete) error = saved.Messages[^1].Error;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            error = "Unable to save conversation history. Reopen History or start a new conversation.";
            complete = false;
        }
        finally {
            history.Release(turn);
        }

        if (complete) {
            await SendEvent(new { type = "done", conversationId = saved.Id, conversationRevision = saved.Revision });
        }
        else {
            await SendEvent(new { type = "error", error, conversationId = saved?.Id ?? turn.Conversation.Id, conversationRevision = saved?.Revision ?? turn.Conversation.Revision, historySaved = saved is not null, refreshOptions });
        }

        return null;
    }

    private static async Task WriteChatEventAsync(HttpListenerContext ctx, object value, CancellationToken token = default) {
        byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, jsonOptions) + "\n");
        await ctx.Response.OutputStream.WriteAsync(bytes, token);
        await ctx.Response.OutputStream.FlushAsync(token);
    }

    internal static Message[] ReadMessages(JsonElement root) {
        if (!root.TryGetProperty("messages", out JsonElement entries) || entries.ValueKind != JsonValueKind.Array || entries.GetArrayLength() == 0 || entries.GetArrayLength() % 2 == 0) return null;

        List<Message> messages = new List<Message>();
        foreach (JsonElement entry in entries.EnumerateArray()) {
            if (entry.ValueKind != JsonValueKind.Object) return null;
            string role = GetString(entry, "role");
            string text = GetString(entry, "content");

            if (role != (messages.Count % 2 == 0 ? "user" : "assistant") || String.IsNullOrWhiteSpace(text) || (role == "user" && text.Length > MAX_TEXT_LENGTH)) {
                return null;
            }

            messages.Add(new Message(role, text));
        }

        return messages.ToArray();
    }

    private static bool IsOpenAiCompatible(string type) => type is "openai" or "xai" or "google";

    internal static async Task<string> FetchReplyAsync(string type, string key, string model, Message[] messages, HttpClient client, CancellationToken token = default, string endpoint = null, Func<string, Task> onText = null, string reasoning = null, Func<string, Task> onReasoning = null) {
        string address = type switch {
            "openai"    => "https://api.openai.com/v1/chat/completions",
            "xai"       => "https://api.x.ai/v1/chat/completions",
            "google"    => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "anthropic" => "https://api.anthropic.com/v1/messages",
            "ollama"    => $"{NormalizeEndpoint(endpoint ?? "http://localhost:11434") ?? throw new ArgumentException("Invalid Ollama server URL")}/api/chat",
            _ => throw new ArgumentException("Unsupported agent provider", nameof(type))
        };

        Message[] requestMessages = type == "anthropic" ? messages : [new Message(PersonaRole(type, model), PERSONA), ..messages];
        Dictionary<string, object> payload = new Dictionary<string, object> {
            ["model"] = model, ["messages"] = requestMessages, ["stream"] = onText is not null
        };

        if (type == "openai") {
            payload["store"] = false;
            payload["max_completion_tokens"] = 4096;
            if (!String.IsNullOrEmpty(reasoning)) {
                payload["reasoning_effort"] = reasoning;
            }
        }
        else if (type is "xai" or "google") {
            payload["max_tokens"] = 4096;
            if (!String.IsNullOrEmpty(reasoning)) {
                payload["reasoning_effort"] = reasoning;
            }
        }
        else if (type == "anthropic") {
            payload["system"] = PERSONA;
            payload["max_tokens"] = 4096;
            if (!String.IsNullOrEmpty(reasoning)) {
                payload["output_config"] = new Dictionary<string, string> { ["effort"] = reasoning };
            }
        }
        else if (!String.IsNullOrEmpty(reasoning)) {
            payload["think"] = reasoning switch { "true" => (object)true, "false" => false, _ => reasoning };
        }

        using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, address);
        if (!String.IsNullOrEmpty(key)) {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        }

        if (type == "anthropic") {
            request.Headers.Add("anthropic-version", "2026-10-21");
        }

        string requestBody = JsonSerializer.Serialize(payload, jsonOptions);
        request.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");
#if DEBUG
        LogProviderChatJson(requestBody, false);
#endif

        using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        if (!response.IsSuccessStatusCode) {
            string body = await response.Content.ReadAsStringAsync(token);
            throw new HttpRequestException(ReadProviderError(type, response.StatusCode, body, key), null, response.StatusCode);
        }

        if (onText is not null) {
            using Stream stream = await response.Content.ReadAsStreamAsync(token);
            using StreamReader reader = new StreamReader(stream, Encoding.UTF8);
            return await ReadReplyStreamAsync(type, reader, onText, token, key, onReasoning);
        }

        string responseBody = await response.Content.ReadAsStringAsync(token);
        using JsonDocument doc = JsonDocument.Parse(responseBody);
        JsonElement root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new JsonException("Invalid provider response");
        if (IsProviderError(root)) throw new InvalidOperationException(ReadProviderError(type, null, root, key));
#if DEBUG
        LogProviderChatJson(responseBody, true);
#endif

        string text = null;
        string reasoningText = null;
        if (IsOpenAiCompatible(type) && root.TryGetProperty("choices", out JsonElement choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0) {
            JsonElement message = choices[0].GetProperty("message");
            text = GetString(message, "content") ?? GetString(message, "refusal");
            reasoningText = ReadReasoningText(message);
        }
        else if (type == "anthropic" && root.TryGetProperty("content", out JsonElement content) && content.ValueKind == JsonValueKind.Array) {
            text = String.Join("\n", content.EnumerateArray().Where(block => GetString(block, "type") == "text").Select(block => GetString(block, "text")));
            reasoningText = String.Join("\n\n", content.EnumerateArray().Where(block => GetString(block, "type") == "thinking").Select(block => GetString(block, "thinking")));
        }
        else if (type == "ollama" && root.TryGetProperty("message", out JsonElement ollamaMessage)) {
            text = GetString(ollamaMessage, "content");
            reasoningText = ReadReasoningText(ollamaMessage);
        }

        if (onReasoning is not null && !String.IsNullOrEmpty(reasoningText)) {
            await onReasoning(reasoningText);
        }

        if (String.IsNullOrWhiteSpace(text)) {
            throw new JsonException("The provider returned no text response");
        }

        return text;
    }

    private static string ReadReasoningText(JsonElement message) {
        foreach (string field in reasoningTextFields) {
            string value = GetString(message, field);
            if (!String.IsNullOrEmpty(value)) return value;
        }
        return null;
    }

    private static async Task<string> ReadReplyStreamAsync(string type, StreamReader reader, Func<string, Task> onText, CancellationToken token, string key, Func<string, Task> onReasoning) {
        StringBuilder text = new StringBuilder();
        StringBuilder eventData = new StringBuilder();
        bool completed = false;
        bool hasTextBlock = false;
        bool hasThinkingBlock = false;

        while (!completed) {
            string line = await reader.ReadLineAsync(token);
            if (line is null) break;

            string data;
            if (type == "ollama") {
                if (String.IsNullOrWhiteSpace(line)) continue;
                data = line;
            }
            else {
                //SSE events may span multiple data lines; comments and other fields carry no text.
                if (line.StartsWith("data:", StringComparison.Ordinal)) {
                    if (eventData.Length > 0) eventData.Append('\n');
                    string value = line[5..];
                    eventData.Append(value.StartsWith(' ') ? value[1..] : value);
                }

                if (line.Length != 0 || eventData.Length == 0) continue;
                data = eventData.ToString();
                eventData.Clear();
            }

            if (IsOpenAiCompatible(type) && data == "[DONE]") {
#if DEBUG
                LogProviderChatJson(data, true);
#endif
                completed = true;
                continue;
            }

            using JsonDocument doc = JsonDocument.Parse(data);
            JsonElement root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) {
                throw new JsonException("Invalid stream event");
            }

            if (IsProviderError(root)) {
                throw new InvalidOperationException(ReadProviderError(type, null, root, key));
            }
#if DEBUG
            LogProviderChatJson(data, true);
#endif

            string delta = null;
            string reasoningDelta = null;
            if (IsOpenAiCompatible(type) && root.TryGetProperty("choices", out JsonElement choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty("delta", out JsonElement change) && change.ValueKind == JsonValueKind.Object) {
                delta = GetString(change, "content") ?? GetString(change, "refusal");
                reasoningDelta = ReadReasoningText(change);
            }
            else if (type == "anthropic") {
                string eventType = GetString(root, "type");
                if (eventType == "content_block_start" && root.TryGetProperty("content_block", out JsonElement block) && block.ValueKind == JsonValueKind.Object) {
                    switch (GetString(block, "type")) {
                        case "text":
                            delta = (hasTextBlock ? "\n" : String.Empty) + GetString(block, "text");
                            hasTextBlock = true;
                            break;

                        case "thinking":
                            reasoningDelta = (hasThinkingBlock ? "\n\n" : String.Empty) + GetString(block, "thinking");
                            hasThinkingBlock = true;
                            break;
                    }
                }
                else if (eventType == "content_block_delta" && root.TryGetProperty("delta", out JsonElement blockDelta) && blockDelta.ValueKind == JsonValueKind.Object) {
                    switch (GetString(blockDelta, "type")) {
                        case "text_delta":
                            delta = GetString(blockDelta, "text");
                            break;

                        case "thinking_delta":
                            reasoningDelta = GetString(blockDelta, "thinking");
                            break;
                    }
                }
                completed = eventType == "message_stop";
            }
            else if (type == "ollama") {
                if (root.TryGetProperty("message", out JsonElement message) && message.ValueKind == JsonValueKind.Object) {
                    delta = GetString(message, "content");
                    reasoningDelta = ReadReasoningText(message);
                }
                completed = root.TryGetProperty("done", out JsonElement done) && done.ValueKind == JsonValueKind.True;
            }

            if (onReasoning is not null && !String.IsNullOrEmpty(reasoningDelta)) {
                await onReasoning(reasoningDelta);
            }

            if (!String.IsNullOrEmpty(delta)) {
                text.Append(delta);
                await onText(delta);
            }
        }

        if (!completed || String.IsNullOrWhiteSpace(text.ToString())) {
            throw new JsonException("The provider returned an incomplete or empty text response");
        }

        return text.ToString();
    }

    internal static async Task<Model[]> FetchModelsAsync(string type, string key, HttpClient client, CancellationToken token = default, string endpoint = null) {
        string address = type switch {
            "openai"    => "https://api.openai.com/v1/models",
            "xai"       => "https://api.x.ai/v1/models",
            "google"    => "https://generativelanguage.googleapis.com/v1beta/openai/models",
            "anthropic" => "https://api.anthropic.com/v1/models?limit=1000",
            "ollama"    => $"{NormalizeEndpoint(endpoint ?? "http://localhost:11434") ?? throw new ArgumentException("Invalid Ollama server URL")}/api/tags",
            _ => throw new ArgumentException("Unsupported agent provider", nameof(type))
        };

        Dictionary<string, Model> models = new Dictionary<string, Model>();
        HashSet<string> cursors = new HashSet<string>();
        string cursor = null;

        do {
            string url = cursor is null ? address : $"{address}&after_id={Uri.EscapeDataString(cursor)}";
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, url);
            if (!String.IsNullOrEmpty(key)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
            if (type == "anthropic") request.Headers.Add("anthropic-version", "2026-10-21");

            using HttpResponseMessage response = await client.SendAsync(request, token);
            response.EnsureSuccessStatusCode();

            using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
            JsonElement root = doc.RootElement;

            foreach (JsonElement entry in root.GetProperty(type == "ollama" ? "models" : "data").EnumerateArray()) {
                string id = type == "ollama" ? GetString(entry, "model") ?? GetString(entry, "name") : GetString(entry, "id");
                if (String.IsNullOrWhiteSpace(id)) continue;
                models[id] = new Model(id, GetString(entry, "display_name") ?? id);
            }

            cursor = null;

            if (type == "anthropic" && root.TryGetProperty("has_more", out JsonElement more) && more.ValueKind == JsonValueKind.True) {
                cursor = GetString(root, "last_id");
                if (String.IsNullOrEmpty(cursor) || !cursors.Add(cursor)) {
                    throw new JsonException("Invalid model pagination cursor");
                }
            }
        } while (cursor is not null);

        return models.Values.OrderBy(model => model.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static string PathOf(string id) => Path.Join(Data.DIR_ARES_AGENTS, $"{id}.json");

    private static string Revision(Agent agent) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(agent, jsonOptions)));

    private static string ReadKey(Agent agent) => String.IsNullOrEmpty(agent.Secret) ? String.Empty : Encoding.UTF8.GetString(Cryptography.Decrypt(Convert.FromBase64String(agent.Secret), Configuration.DB_KEY, Configuration.DB_KEY_IV));

    internal static string NormalizeEndpoint(string endpoint) =>
        endpoint is not null && endpoint.Length <= 2048 && Uri.TryCreate(endpoint.Trim(), UriKind.Absolute, out Uri uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) && !String.IsNullOrEmpty(uri.Host)
            && uri.UserInfo.Length == 0 && uri.Query.Length == 0 && uri.Fragment.Length == 0 ? uri.AbsoluteUri.TrimEnd('/') : null;

    private static Agent ReadAgent(string id) {
        if (id is null) return null;

        try {
            string path = PathOf(id);
            if (!File.Exists(path)) return null;

            Agent agent = JsonSerializer.Deserialize<Agent>(File.ReadAllBytes(path), jsonOptions);
            return agent?.Id == id && ProviderLabel(agent.Type) is not null && !String.IsNullOrWhiteSpace(agent.Name) && (agent.Type == "ollama" ? NormalizeEndpoint(agent.Endpoint) is not null : !String.IsNullOrEmpty(agent.Secret)) ? agent : null;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    private static Agent[] ReadAgents() {
        if (!Directory.Exists(Data.DIR_ARES_AGENTS)) return [];

        return Directory.EnumerateFiles(Data.DIR_ARES_AGENTS, "*.json")
            .Select(path => Guid.TryParse(Path.GetFileNameWithoutExtension(path), out Guid guid) ? ReadAgent(guid.ToString()) : null)
            .Where(agent => agent is not null)
            .OrderBy(agent => agent.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string RequestId(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        return parameters is not null && parameters.TryGetValue("id", out string id) && Guid.TryParse(id, out Guid guid) ? guid.ToString() : null;
    }

    private static string GetString(JsonElement root, string name) =>
        root.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static byte[] Error(string message) => JsonSerializer.SerializeToUtf8Bytes(new { error = message });

    private static JsonDocument ReadJsonBody(HttpListenerContext ctx, int limit = MAX_PAYLOAD) {
        if (ctx.Request.ContentLength64 > limit) return null;

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        char[] buffer = new char[limit + 1];
        int count = reader.ReadBlock(buffer, 0, buffer.Length);

        if (count == 0 || count > limit) return null;

        try {
            return JsonDocument.Parse(new string(buffer, 0, count));
        }
        catch (JsonException) {
            return null;
        }
    }
}
