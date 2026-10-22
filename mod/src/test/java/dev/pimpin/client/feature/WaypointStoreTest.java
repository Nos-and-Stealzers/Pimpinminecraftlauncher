package dev.pimpin.client.feature;

import java.nio.file.*;
import java.util.*;

/** Dependency-light executable regression suite; every file lives in a fresh temp root. */
public final class WaypointStoreTest {
    private static int checks;
    private static void check(boolean ok, String label) { if (!ok) throw new AssertionError(label); checks++; }
    private static void rejected(Runnable action, String label) {
        try { action.run(); throw new AssertionError(label); } catch (IllegalArgumentException expected) { checks++; }
    }
    private static String marker(String name, String x) {
        return "{\"name\":\"" + name + "\",\"x\":" + x + ",\"y\":64,\"z\":-2,\"color\":-11141121,\"shown\":true}";
    }
    public static void main(String[] args) throws Exception {
        Path parent = Path.of(System.getenv("TMPDIR")).toAbsolutePath().normalize();
        check(parent.toString().toLowerCase(Locale.ROOT).contains("hermes"), "explicit isolated scratch root");
        Path root = Files.createTempDirectory(parent, "waypoint-regression-");
        check(WaypointRecord.validName("  Base  ").equals("Base"), "trim name");
        check(WaypointRecord.coordinate("+30000000", false) == 30000000, "upper world edge");
        check(WaypointRecord.coordinate("-2048", true) == -2048, "lower vertical edge");
        for (String bad : List.of("", " ", "1.2", "1e3", "NaN", "999999999999", "30000001", "-30000001", "0x10", "1 2")) rejected(() -> WaypointRecord.coordinate(bad, false), "reject coordinate " + bad);
        rejected(() -> WaypointRecord.coordinate("2049", true), "Y out of bounds");
        for (String bad : List.of("", "   ", "a\nb", "§aBase", "x".repeat(49))) rejected(() -> WaypointRecord.validName(bad), "reject name");
        Path file = root.resolve("markers.json");
        var store = new WaypointStore<>(file, WaypointRecord.class);
        check(store.writable() && store.bucket("worldA|overworld", null).isEmpty(), "new file");
        WaypointRecord p = new WaypointRecord(); p.name = "Base"; p.x = 12; p.y = 64; p.z = -2; p.color = -1;
        store.bucket("worldA|overworld", null).add(p);
        check(store.save(), "atomic save");
        var loaded = new WaypointStore<>(file, WaypointRecord.class);
        check(loaded.bucket("worldA|overworld", null).get(0).id.equals(p.id), "stable ID round trip");
        check(loaded.bucket("worldB|overworld", null).isEmpty(), "world isolation");
        check(loaded.bucket("worldA|nether", null).isEmpty(), "dimension isolation");
        check(loaded.bucket("mp:host|overworld", null).isEmpty() && loaded.bucket("mp:host:25565|overworld", null).isEmpty(), "ports not merged");
        String legacy = "{\"sp:World|overworld\":[" + marker("Old base", "42") + "],\"mp:other|nether\":[" + marker("Other", "3") + "]}";
        Files.writeString(file, legacy);
        loaded = new WaypointStore<>(file, WaypointRecord.class);
        check(loaded.hasBucket("sp:World|overworld"), "legacy discoverable");
        check(loaded.bucket("sp-path:first|overworld", null).isEmpty(), "legacy is not silently claimed");
        loaded.recover("sp-path:first|overworld", "sp:World|overworld");
        check(loaded.bucket("sp-path:first|overworld", null).size() == 1, "confirmed recovery keeps markers");
        check(loaded.bucket("sp-path:second|overworld", "sp:World|overworld").isEmpty(), "same-name second save cannot claim again");
        check(Files.readString(file.resolveSibling("markers.json.pre-world-id.bak")).equals(legacy), "legacy backup byte-preserved");
        check(new WaypointStore<>(file, WaypointRecord.class).bucket("mp:other|nether", null).size() == 1, "unrelated bucket retained");
        for (String bad : List.of("", "null", "[]", "{bad", "{\"a\":null}", "{\"a\":[null]}", "{\"a\":[{}]}", "{} trailing", "{\"a\":[" + marker("bad", "1.5") + "]}", "{\"a\":[" + marker("bad", "4294967296") + "]}", "{\"a\":[" + marker("bad", "30000001") + "]}")) {
            Files.writeString(file, bad);
            var broken = new WaypointStore<>(file, WaypointRecord.class);
            check(!broken.writable() && broken.error() != null, "bad load is blocked");
            check(!broken.save() && Files.readString(file).equals(bad), "unreadable bytes never overwritten");
        }
        String duplicate = "{\"a\":[" + marker("One", "1").replace("\"name\"", "\"id\":\"same\",\"name\"") + "," + marker("Two", "2").replace("\"name\"", "\"id\":\"same\",\"name\"") + "]}";
        Files.writeString(file, duplicate);
        loaded = new WaypointStore<>(file, WaypointRecord.class);
        check(!loaded.bucket("a", null).get(0).id.equals(loaded.bucket("a", null).get(1).id), "duplicate IDs repaired without deleting markers");
        check(loaded.save(), "repaired IDs saved");
        String extra = Files.readString(file).replace("\"name\": \"One\"", "\"extension\": 123, \"name\": \"One\"");
        Files.writeString(file, extra);
        loaded = new WaypointStore<>(file, WaypointRecord.class);
        check(loaded.save() && Files.readString(file).contains("\"extension\": 123"), "unknown marker field preserved");
        Path conflict = root.resolve("conflict"); Files.writeString(conflict, "not a directory");
        var failure = new WaypointStore<>(conflict.resolve("markers.json"), WaypointRecord.class);
        failure.bucket("a", null).add(p);
        check(!failure.save() && !failure.writable(), "write failure surfaced and blocks further changes");
        System.out.println("WAYPOINT_REGRESSION PASS " + checks + " checks; isolated root=" + root);
    }
}
