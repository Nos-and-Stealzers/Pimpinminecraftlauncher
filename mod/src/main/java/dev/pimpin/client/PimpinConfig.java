package dev.pimpin.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Every Pimpin Client setting, saved as config/pimpin-client.json. */
public final class PimpinConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("pimpin-client.json");
    private static PimpinConfig instance;

    // HUD
    public boolean hud = true;
    public boolean showFps = true;
    public boolean showCoords = true;
    public boolean showDirection = true;
    public boolean showBiome = false;
    public boolean showPing = true;
    public boolean showSpeed = false;
    public boolean showClock = false;
    public boolean showDeath = true;
    public boolean keystrokes = true;
    public boolean armorHud = true;
    public int hudCorner = 0; // 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
    public float hudScale = 1.0f;
    public int accent = 0xFFB56CFF;
    public boolean hudBackground = true;

    // Minimap
    public boolean minimap = true;
    public int minimapSize = 96;
    public int mapZoom = 1; // index into Minimap.ZOOMS
    public int minimapCorner = 1; // same corners as the HUD
    public boolean minimapRound = false;
    public boolean minimapRotate = false;
    public boolean minimapCoords = true;
    public boolean minimapPlayers = true;
    public boolean minimapMobs = true;
    public boolean minimapCaves = true;
    public boolean minimapShading = true;

    // Zoom
    public float zoomFactor = 4.0f;
    public boolean smoothZoom = true;
    public boolean scrollZoom = true;

    // FPS booster
    public boolean backgroundFps = true;
    public int backgroundFpsLimit = 15;
    public boolean boostActive = false;
    public BoostBackup boostBackup = null;

    // Mod menu
    public boolean menuButtons = true;

    // Loading screen
    public boolean brandedLoading = true;

    /** Option values saved before the FPS boost, so it can be undone. */
    public static final class BoostBackup {
        public int viewDistance;
        public int simulationDistance;
        public String graphics;
        public String clouds;
        public String particles;
        public boolean entityShadows;
        public int biomeBlend;
        public double entityDistance;
        public boolean ao;
    }

    public static PimpinConfig get() {
        if (instance == null) load();
        return instance;
    }

    public static void load() {
        if (Files.exists(FILE)) {
            try (Reader r = Files.newBufferedReader(FILE)) {
                instance = GSON.fromJson(r, PimpinConfig.class);
            } catch (Exception e) {
                PimpinClient.LOG.warn("Could not read {}, using defaults", FILE, e);
            }
        }
        if (instance == null) instance = new PimpinConfig();
        instance.minimapSize = Math.max(48, Math.min(192, instance.minimapSize));
        instance.hudScale = Math.max(0.5f, Math.min(2f, instance.hudScale));
        instance.mapZoom = Math.max(0, Math.min(4, instance.mapZoom));
        instance.minimapCorner = Math.floorMod(instance.minimapCorner, 4);
        instance.hudCorner = Math.floorMod(instance.hudCorner, 4);
    }

    public static void save() {
        try {
            Files.createDirectories(FILE.getParent());
            Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
            try (Writer w = Files.newBufferedWriter(tmp)) {
                GSON.toJson(get(), w);
            }
            Files.move(tmp, FILE, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            PimpinClient.LOG.warn("Could not save {}", FILE, e);
        }
    }

    /** Puts every setting back to its default (the FPS boost must be undone first). */
    public static void reset() {
        PimpinConfig fresh = new PimpinConfig();
        for (var f : PimpinConfig.class.getFields()) {
            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
            try {
                f.set(get(), f.get(fresh));
            } catch (IllegalAccessException ignored) {
                // only public fields are copied
            }
        }
        save();
    }
}
