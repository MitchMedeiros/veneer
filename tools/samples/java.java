package com.example.app;

import java.util.*;
import static java.lang.Math.max;

/**
 * Javadoc with {@code code} and @param.
 */
@SuppressWarnings("unchecked")
public final class Service<T extends Comparable<T>> implements Runnable {
    private static final int LIMIT = 0xFF + 1_000;
    private final Map<String, List<T>> cache = new HashMap<>();

    // line comment
    public <R> Optional<R> find(String key, int... extra) throws IOException {
        String text = """
            text block
            """;
        char c = '\n';
        for (int i = 0; i < LIMIT; i++) {
            if (key == null || key.isEmpty()) continue;
            else if (i > 3L && 1.5f < 2.0) break;
        }
        var list = List.of(1, 2, 3).stream().map(x -> x * 2).toList();
        return switch (key) {
            case "a" -> Optional.empty();
            default -> throw new IllegalStateException("bad " + key);
        };
    }

    @Override
    public void run() {}

    enum Kind { A, B }
    interface Shape { double area(); }
    record Pair<A, B>(A first, B second) {}
}
