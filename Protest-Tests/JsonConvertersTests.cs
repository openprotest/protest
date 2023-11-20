global using NUnit.Framework;
using System.Collections.Concurrent;
using System.Text.Json;

namespace Protest.Tests;

internal class JsonConvertersTests {
    private readonly string origin = "unit test";
    Database database;

    [SetUp]
    public void Setup() {
        database = new Database("unit test", ".");

        Database.Entry john = new Database.Entry {
            filename = Database.GenerateFilename(),
            syncWrite = new object(),
            attributes = new ConcurrentDictionary<string, Database.Attribute>()
        };
        john.attributes.TryAdd("firstname", new Database.Attribute() {
            value = "John",
            date = DateTime.Now.Ticks,
            origin = origin
        });
        john.attributes.TryAdd("lastname", new Database.Attribute() {
            value = "Smith",
            date = DateTime.Now.Ticks,
            origin = origin
        });
        john.attributes.TryAdd("title", new Database.Attribute() {
            value = "CEO",
            date = DateTime.Now.Ticks,
            origin = origin
        });
    }

    [Test]
    public void AttributesJsonConverter_SerializeDeserialize_StringsAreEqual() {
        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new AttributesJsonConverter(true));
        
        byte[] first = JsonSerializer.SerializeToUtf8Bytes(database.dictionary, options);

        ConcurrentDictionary<string, Database.Attribute>? reverse = JsonSerializer.Deserialize<ConcurrentDictionary<string, Database.Attribute>>(first, options);

        byte[] second = JsonSerializer.SerializeToUtf8Bytes(reverse, options);

        Assert.That(first.SequenceEqual(second), Is.True);
    }

    [Test]
    public void DatabaseJsonConverter_SerializeDeserialize_StringsAreEqual() {
        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new DatabaseJsonConverter("unit test", ".", true));

        byte[] first = JsonSerializer.SerializeToUtf8Bytes(database, options);

        Database? reverse = JsonSerializer.Deserialize<Database>(first, options);

        byte[] second = JsonSerializer.SerializeToUtf8Bytes(reverse, options);

        Assert.That(first.SequenceEqual(second), Is.True);
    }

}