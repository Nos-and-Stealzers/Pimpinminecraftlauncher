package dev.pimpin.client.feature;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.storage.LevelResource;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** World/dimension-scoped markers. Never sends coordinates to a server. */
public final class Waypoints {
    public static final int[] COLORS = {0xFF55FFFF, 0xFFFFAA00, 0xFF55FF55, 0xFFFF55FF, 0xFFFFFF55, 0xFF5599FF, 0xFFFF7755};
    public static final class Point extends WaypointRecord {
        public BlockPos pos() { return new BlockPos(x, y, z); }
    }
    public record Target(String id, String name, int x, int y, int z, int color, boolean shown) { }
    private static WaypointStore<Point> store;
    private static String selectedKey, selectedId;
    private Waypoints() { }
    private static WaypointStore<Point> store() {
        if (store == null) store = new WaypointStore<>(FabricLoader.getInstance().getConfigDir().resolve("pimpin-waypoints.json"), Point.class);
        return store;
    }
    public static String error() { return store().error(); }
    public static boolean writable() { return store().writable(); }
    public static void save() { store().save(); }
    private static String world(Minecraft mc) {
        if (mc.getSingleplayerServer() != null) {
            Path root = mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
            try { root = root.toRealPath(); } catch (Exception ignored) { }
            try {
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(root.toString().getBytes(StandardCharsets.UTF_8));
                return "sp-path:" + HexFormat.of().formatHex(digest);
            } catch (Exception e) { throw new IllegalStateException(e); }
        }
        // Preserve exact server identity; never merge ports, proxies or aliases.
        return mc.getCurrentServer() != null ? "mp:" + mc.getCurrentServer().ip : null;
    }
    private static String key(Minecraft mc) {
        if (mc.level == null) return null;
        String world = world(mc);
        return world == null ? null : world + "|" + mc.level.dimension();
    }
    public static String dimension(Minecraft mc) {
        if (mc.level == null) return "Not in a world";
        return dev.pimpin.client.compat.Compat.prettyKey(mc.level.dimension());
    }
    /** Compatibility live-list API. Renderers should prefer immutable targets(). */
    public static List<Point> here(Minecraft mc) {
        if (mc.level == null) return List.of();
        String key = key(mc);
        if (key == null) return List.of();
        String legacy = mc.getSingleplayerServer() == null ? null : "sp:" + mc.getSingleplayerServer().getWorldData().getLevelName() + "|" + mc.level.dimension();
        return store().bucket(key, null);
    }
    private static String legacy(Minecraft mc) {
        return mc.level == null || mc.getSingleplayerServer() == null ? null : "sp:" + mc.getSingleplayerServer().getWorldData().getLevelName() + "|" + mc.level.dimension();
    }
    public static boolean legacyAvailable(Minecraft mc) {
        String legacy = legacy(mc);
        return legacy != null && store().hasBucket(legacy) && !store().hasBucket(key(mc));
    }
    public static void recoverLegacy(Minecraft mc) {
        if (!legacyAvailable(mc) || !writable()) return;
        // Remove an empty bucket created by browsing; explicit recovery must still work.
        store().recover(key(mc), legacy(mc));
    }
    /** Map-only view; display filters never alter stored markers. */
    public static List<Point> visible(Minecraft mc) {
        int range = WaypointPreferences.range();
        return here(mc).stream().filter(p -> p.shown && (range == 0 || mc.player == null || distance(mc, snapshot(p)) <= range)).toList();
    }
    public static List<Target> targets(Minecraft mc) { return here(mc).stream().map(Waypoints::snapshot).toList(); }
    private static Target snapshot(Point p) { return new Target(p.id, p.name, p.x, p.y, p.z, p.color, p.shown); }
    /** Null outside selected world/dimension, or if marker is removed/hidden. */
    public static Target selectedTarget(Minecraft mc) {
        if (selectedId == null || !Objects.equals(key(mc), selectedKey)) return null;
        return here(mc).stream().filter(p -> selectedId.equals(p.id) && p.shown).findFirst().map(Waypoints::snapshot).orElse(null);
    }
    public static void track(Minecraft mc, Point point) {
        if (point != null && here(mc).stream().noneMatch(p -> Objects.equals(p.id, point.id))) return;
        selectedKey = point == null ? null : key(mc); selectedId = point == null ? null : point.id;
        if (point != null && !point.shown && writable()) { point.shown = true; save(); }
    }
    public static double distance(Minecraft mc, Target p) {
        if (mc.player == null) return Double.POSITIVE_INFINITY;
        return Math.sqrt(Math.pow(p.x - mc.player.getX(), 2) + Math.pow(p.y - mc.player.getY(), 2) + Math.pow(p.z - mc.player.getZ(), 2));
    }
    public static String distanceText(Minecraft mc, Point p) {
        double d = distance(mc, snapshot(p));
        return Double.isFinite(d) ? String.format(Locale.ROOT, d >= 1000 ? "%.1f km" : "%.0f m", d >= 1000 ? d / 1000 : d) : "—";
    }
    public static Point addHere(Minecraft mc) {
        if (mc.player == null || mc.level == null || key(mc) == null || !writable()) return null;
        List<Point> list = here(mc); Point p = new Point();
        p.name = "Waypoint " + (list.size() + 1);
        p.x = mc.player.blockPosition().getX(); p.y = mc.player.blockPosition().getY(); p.z = mc.player.blockPosition().getZ();
        p.color = COLORS[list.size() % COLORS.length]; list.add(p); save(); return p;
    }
    public static String edit(Minecraft mc, String id, String name, String x, String y, String z, int color, boolean shown) {
        if (!writable()) return error();
        try {
            String valid = WaypointRecord.validName(name);
            int px = WaypointRecord.coordinate(x, false), py = WaypointRecord.coordinate(y, true), pz = WaypointRecord.coordinate(z, false);
            Point p = here(mc).stream().filter(v -> v.id.equals(id)).findFirst().orElse(null);
            if (p == null) return "Waypoint no longer exists in this dimension.";
            p.name = valid; p.x = px; p.y = py; p.z = pz; p.color = color | 0xFF000000; p.shown = shown;
            save(); return error();
        } catch (IllegalArgumentException e) { return e.getMessage(); }
    }
    public static void remove(Minecraft mc, Point point) {
        if (!writable()) return;
        here(mc).removeIf(p -> Objects.equals(p.id, point.id));
        if (Objects.equals(selectedId, point.id)) { selectedId = null; selectedKey = null; }
        save();
    }
    static boolean fixture(Minecraft mc) {
        if (!FabricLoader.getInstance().isDevelopmentEnvironment() || !Boolean.getBoolean("pimpin.dev.waypointTest") || mc.getSingleplayerServer() == null) return false;
        Path game = mc.gameDirectory.toPath().toAbsolutePath().normalize();
        if (!game.getParent().endsWith("run") || !game.getParent().getParent().endsWith("mod")
                || !mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().endsWith("PimpinWaypointTest")) return false;
        store = new WaypointStore<>(game.resolve("waypoint-test-fixture/markers.json"), Point.class);
        return true;
    }
}
