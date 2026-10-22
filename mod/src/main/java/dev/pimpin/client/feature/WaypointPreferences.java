package dev.pimpin.client.feature;

import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;

/** Optional display preferences, separate from shared client configuration. */
public final class WaypointPreferences {
    private static boolean loaded, writable = true;
    private static boolean labels = true, navigation = true;
    private static int range;
    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("pimpin-waypoint-display.json"); }
    private static void load() {
        if (loaded) return; loaded = true;
        if (!Files.exists(file())) return;
        try {
            if (Files.size(file()) > 4096) throw new IllegalArgumentException();
            JsonObject json = JsonParser.parseString(Files.readString(file())).getAsJsonObject();
            if (json.has("labels")) { if (!json.get("labels").getAsJsonPrimitive().isBoolean()) throw new IllegalArgumentException(); labels = json.get("labels").getAsBoolean(); }
            if (json.has("navigation")) { if (!json.get("navigation").getAsJsonPrimitive().isBoolean()) throw new IllegalArgumentException(); navigation = json.get("navigation").getAsBoolean(); }
            if (json.has("range")) {
                String value = json.get("range").getAsString();
                if (!value.matches("0|250|1000|5000")) throw new IllegalArgumentException();
                range = Integer.parseInt(value);
            }
        } catch (Exception e) { writable = false; labels = true; navigation = true; range = 0; }
    }
    public static boolean labels() { load(); return labels; }
    public static boolean navigation() { load(); return navigation; }
    /** Maximum marker/label distance in blocks; zero means unlimited. Tracked navigation remains visible. */
    public static int range() { load(); return range; }
    public static boolean writable() { load(); return writable; }
    public static void toggleLabels() { load(); if (writable) { labels = !labels; save(); } }
    public static void toggleNavigation() { load(); if (writable) { navigation = !navigation; save(); } }
    public static void cycleRange() { load(); if (writable) { range = range == 0 ? 250 : range == 250 ? 1000 : range == 1000 ? 5000 : 0; save(); } }
    private static void save() {
        Path temp = null;
        try {
            JsonObject json = new JsonObject(); json.addProperty("labels", labels); json.addProperty("navigation", navigation); json.addProperty("range", range);
            Files.createDirectories(file().getParent()); temp = Files.createTempFile(file().getParent(), "waypoint-display-", ".tmp");
            Files.writeString(temp, new GsonBuilder().setPrettyPrinting().create().toJson(json));
            try { Files.move(temp, file(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temp, file(), StandardCopyOption.REPLACE_EXISTING); }
        } catch (Exception e) { writable = false; }
        finally { if (temp != null) try { Files.deleteIfExists(temp); } catch (Exception ignored) { } }
    }
}
