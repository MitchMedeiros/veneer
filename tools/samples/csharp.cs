using System;
using System.Collections.Generic;
using System.Linq;

namespace Sample.App;

/// <summary>Doc comment with <c>code</c>.</summary>
[Serializable]
public sealed record Person(string Name, int Age);

public abstract class Repo<T> where T : class, new()
{
    private readonly Dictionary<int, T> _items = new();
    public static readonly int Max = 0xFF + 1_000;
    public event EventHandler<T>? Changed;

    // line comment
    public async Task<IReadOnlyList<T>> LoadAsync(int id, CancellationToken ct = default)
    {
        var text = $"id {id} {{literal}} {_items.Count:N0}";
        var verbatim = @"C:\path ""quoted""";
        var raw = """
            raw text
            """;
        char c = '\n';
        foreach (var (key, value) in _items.Where(kv => kv.Key > 1 && kv.Value is not null))
        {
            if (key == id) continue;
        }
        await Task.Delay(10, ct).ConfigureAwait(false);
        return id switch { 1 => new List<T>(), _ => throw new ArgumentException(nameof(id)) };
    }

    protected virtual void OnChanged(T item) => Changed?.Invoke(this, item);
}
