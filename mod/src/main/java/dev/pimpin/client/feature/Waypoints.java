package dev.pimpin.client.feature;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import dev.pimpin.client.PimpinClient;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.BlockPos;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Named map markers, kept per world (or server) and dimension in
 * config/pimpin-waypoints.json.
 */
public final class Waypoints {
    public static final int[] COLORS = {0xFF55FFFF, 0xFFFFAA00, 0xFF55FF55, 0xFFFF55FF, 0xFFFFFF55, 0xFF5599FF, 0xFFFF7755};

    public static final class Point {
        public String name;
        public int x;
        public int y;
        public int z;
        public int color;
        public boolean shown = true;

        public BlockPos pos() {
            return new BlockPos(x, y, z);
        }
    }

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("pimpin-waypoints.json");
    private static Map<String, List<Point>> all;

    private Waypoints() {}

    private static Map<String, List<Point>> all() {
        if (all != null) return all;
        if (Files.exists(FILE)) {
            try (Reader r = Files.newBufferedReader(FILE)) {
                all = GSON.fromJson(r, new TypeToken<LinkedHashMap<String, List<Point>>>() {}.getType());
            } catch (Exception e) {
                PimpinClient.LOG.warn("Could not read {}", FILE, e);
            }
        }
        if (all == null) all = new LinkedHashMap<>();
        return all;
    }

    public static void save() {
        try {
            Files.createDirectories(FILE.getParent());
            Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
            try (Writer w = Files.newBufferedWriter(tmp)) {
                GSON.toJson(all(), w);
            }
            Files.move(tmp, FILE, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            PimpinClient.LOG.warn("Could not save {}", FILE, e);
        }
    }

    /** "world name|dimension" in singleplayer, "server address|dimension" online. */
    private static String key(Minecraft mc) {
        String world;
        if (mc.getSingleplayerServer() != null) {
            world = "sp:" + mc.getSingleplayerServer().getWorldData().getLevelName();
        } else {
            ServerData server = mc.getCurrentServer();
            world = server != null ? "mp:" + server.ip : "unknown";
        }
        return world + "|" + mc.level.dimension();
    }

    /** Waypoints in the current world and dimension (live list, empty when not in a world). */
    public static List<Point> here(Minecraft mc) {
        if (mc.level == null) return List.of();
        return all().computeIfAbsent(key(mc), k -> new ArrayList<>());
    }

    public static Point addHere(Minecraft mc) {
        List<Point> list = here(mc);
        BlockPos p = mc.player.blockPosition();
        Point w = new Point();
        w.name = "Waypoint " + (list.size() + 1);
        w.x = p.getX();
        w.y = p.getY();
        w.z = p.getZ();
        w.color = COLORS[list.size() % COLORS.length];
        list.add(w);
        save();
        return w;
    }

    public static void remove(Minecraft mc, Point w) {
        here(mc).remove(w);
        save();
    }
}
