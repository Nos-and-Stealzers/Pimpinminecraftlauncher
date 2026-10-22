package dev.pimpin.client.feature;

import com.google.gson.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Bounded, fail-closed storage. A bad file is never replaced by an empty one. */
public final class WaypointStore<T extends WaypointRecord> {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private final Path file;
    private final Class<T> type;
    private final Map<String, List<T>> worlds = new LinkedHashMap<>();
    private JsonObject original = new JsonObject();
    private String error;

    public WaypointStore(Path file, Class<T> type) {
        this.file = file;
        this.type = type;
        if (!Files.exists(file)) return;
        try {
            if (Files.size(file) > 8 * 1024 * 1024) throw new IOException("Waypoint file exceeds 8 MiB");
            String source = Files.readString(file, StandardCharsets.UTF_8);
            try (var reader = new com.google.gson.stream.JsonReader(new java.io.StringReader(source))) {
                reader.setLenient(false);
                original = com.google.gson.internal.Streams.parse(reader).getAsJsonObject();
                if (reader.peek() != com.google.gson.stream.JsonToken.END_DOCUMENT) throw new IOException("Trailing JSON data");
            }
            for (var entry : original.entrySet()) {
                if (!entry.getValue().isJsonArray()) throw new IOException("Invalid world bucket");
                var list = new ArrayList<T>();
                Set<String> ids = new HashSet<>();
                for (var element : entry.getValue().getAsJsonArray()) {
                    JsonObject object = element.getAsJsonObject();
                    for (String required : List.of("name", "x", "y", "z", "color"))
                        if (!object.has(required) || object.get(required).isJsonNull()) throw new IOException("Incomplete marker");
                    for (String coordinate : List.of("x", "y", "z", "color")) {
                        if (!object.get(coordinate).getAsJsonPrimitive().isNumber() || !object.get(coordinate).getAsString().matches("-?[0-9]+")) throw new IOException("Non-integer marker value");
                        Integer.parseInt(object.get(coordinate).getAsString());
                    }
                    if (!object.get("name").getAsJsonPrimitive().isString()) throw new IOException("Invalid marker name");
                    if (object.has("shown") && !object.get("shown").getAsJsonPrimitive().isBoolean()) throw new IOException("Invalid marker visibility");
                    T point = GSON.fromJson(object, type);
                    point.validate();
                    if (!ids.add(point.id)) { point.id = UUID.randomUUID().toString(); ids.add(point.id); }
                    list.add(point);
                    if (list.size() > 10000) throw new IOException("Too many markers");
                }
                worlds.put(entry.getKey(), list);
            }
        } catch (Exception exception) {
            worlds.clear();
            error = "Waypoint file unreadable; changes disabled. Restore or repair " + file.getFileName();
        }
    }

    public boolean hasBucket(String key) { return worlds.containsKey(key) && !worlds.get(key).isEmpty(); }
    public String error() { return error; }
    public boolean writable() { return error == null; }
    public void recover(String key, String legacy) {
        if (hasBucket(key)) return;
        worlds.remove(key);
        bucket(key, legacy);
    }
    public List<T> bucket(String key, String legacy) {
        if (!writable()) return List.of();
        if (!worlds.containsKey(key) && legacy != null && worlds.containsKey(legacy)) {
            // Called only after explicit UI confirmation: old display names are ambiguous.
            try {
                Path backup = file.resolveSibling(file.getFileName() + ".pre-world-id.bak");
                if (Files.exists(file) && !Files.exists(backup)) Files.copy(file, backup);
            } catch (IOException e) {
                error = "Could not preserve legacy backup; recovery disabled.";
                return List.of();
            }
            List<T> markers = worlds.remove(legacy);
            worlds.put(key, markers);
            if (save()) original.remove(legacy);
            else { worlds.remove(key); worlds.put(legacy, markers); return List.of(); }
        }
        return worlds.computeIfAbsent(key, ignored -> new ArrayList<>());
    }

    public boolean save() {
        if (!writable()) return false;
        Path temp = null;
        try {
            JsonObject output = new JsonObject();
            for (var bucket : worlds.entrySet()) {
                JsonArray result = new JsonArray();
                JsonArray old = original.has(bucket.getKey()) ? original.getAsJsonArray(bucket.getKey()) : new JsonArray();
                for (T point : bucket.getValue()) {
                    point.validate();
                    JsonObject value = GSON.toJsonTree(point).getAsJsonObject();
                    // Keep extension fields belonging to known IDs from other versions/tools.
                    for (var previous : old) {
                        JsonObject prior = previous.getAsJsonObject();
                        if (prior.has("id") && point.id.equals(prior.get("id").getAsString())) {
                            for (var field : prior.entrySet()) if (!value.has(field.getKey())) value.add(field.getKey(), field.getValue());
                            break;
                        }
                    }
                    result.add(value);
                }
                output.add(bucket.getKey(), result);
            }
            Files.createDirectories(file.toAbsolutePath().getParent());
            temp = Files.createTempFile(file.toAbsolutePath().getParent(), "waypoints-", ".tmp");
            Files.writeString(temp, GSON.toJson(output), StandardCharsets.UTF_8);
            try { Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
            original = output;
            return true;
        } catch (Exception exception) {
            error = "Could not save waypoints; changes disabled. Check disk permissions and reopen the game.";
            return false;
        } finally {
            if (temp != null) try { Files.deleteIfExists(temp); } catch (IOException ignored) { }
        }
    }
}
