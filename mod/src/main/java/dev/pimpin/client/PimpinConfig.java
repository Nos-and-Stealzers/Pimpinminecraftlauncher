package dev.pimpin.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

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
    public int minimapZoom = 1; // blocks per pixel: 1, 2 or 4
    public boolean minimapCoords = true;
    public boolean minimapPlayers = true;

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
    }

    public static void save() {
        try {
            Files.createDirectories(FILE.getParent());
            try (Writer w = Files.newBufferedWriter(FILE)) {
                GSON.toJson(get(), w);
            }
        } catch (Exception e) {
            PimpinClient.LOG.warn("Could not save {}", FILE, e);
        }
    }
}
