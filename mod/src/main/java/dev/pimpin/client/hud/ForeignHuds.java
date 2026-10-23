package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.PimpinConfig.ForeignPlacement;
import net.fabricmc.loader.api.FabricLoader;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Feather-style control over what other mods draw on the HUD: every foreign
 * element can be moved, scaled and hidden just like Pimpin's own modules.
 * The wrappers (ModernHudWrapper / LegacyHudWrapper) report elements here and
 * re-read the saved transform each render, so editor edits apply live.
 * Saved transforms live in pimpin-client.json under "foreign".
 */
public final class ForeignHuds {
    /** Foreign elements seen this session, in first-seen order. */
    private static final LinkedHashSet<String> SEEN = new LinkedHashSet<>();
    /** Counts per legacy source class, so "class#2" stays the same HUD every session. */
    private static final Map<String, Integer> ORDINALS = new HashMap<>();
    /** Set while Pimpin registers its own legacy-callback HUDs; they are not foreign. */
    private static boolean ownRegistering;

    private ForeignHuds() {}

    /** Saved transform for a foreign element; null = render exactly as the mod drew it. */
    public static ForeignPlacement state(String key) {
        Map<String, ForeignPlacement> foreign = PimpinConfig.get().foreign;
        return foreign == null ? null : foreign.get(key);
    }

    /** Get or create the saved transform (used by the editor rows). */
    public static ForeignPlacement ensure(String key) {
        PimpinConfig cfg = PimpinConfig.get();
        if (cfg.foreign == null) cfg.foreign = new LinkedHashMap<>();
        return cfg.foreign.computeIfAbsent(key, k -> new ForeignPlacement());
    }

    /** Forgets a stored transform; the HUD snaps back to where its mod put it. */
    public static void remove(String key) {
        Map<String, ForeignPlacement> foreign = PimpinConfig.get().foreign;
        if (foreign != null) foreign.remove(key);
        PimpinConfig.save();
    }

    /** Forgets every stored transform (used by the editor's reset button). */
    public static void clearAll() {
        PimpinConfig.get().foreign = null;
        PimpinConfig.save();
    }

    /** Registers the key as seen so the editor can list it, even when nothing is moved yet. */
    public static void seen(String key) {
        if (SEEN.size() < 128) SEEN.add(key);
        PimpinClient.LOG.debug("Foreign HUD element seen: {}", key);
    }

    /** Every foreign element Pimpin has seen so far, in first-seen order. */
    public static List<String> keys() {
        return new ArrayList<>(SEEN);
    }

    /** Short human-readable label: "Mod Name — element id" or "ClassName #n". */
    public static String label(String key) {
        if (key.startsWith("mod:")) {
            String id = key.substring(4);
            int sep = id.indexOf(':');
            if (sep > 0) {
                String ns = id.substring(0, sep);
                String owner = ns.equals("minecraft") ? "Vanilla" : FabricLoader.getInstance()
                        .getModContainer(ns).map(c -> c.getMetadata().getName()).orElse(ns);
                return owner + " — " + id.substring(sep + 1);
            }
            return id;
        }
        // Legacy key: cls:fully.qualified.Class#n
        String cls = key.substring(4);
        int hash = cls.lastIndexOf('#');
        String ord = hash >= 0 ? cls.substring(hash + 1) : "1";
        if (hash >= 0) cls = cls.substring(0, hash);
        String simple = cls.substring(cls.lastIndexOf('.') + 1).replace('$', '.');
        int lambda = simple.indexOf("lambda");
        if (lambda > 0) simple = simple.substring(0, lambda).replaceAll("\\.+$", "");
        if (simple.isEmpty()) simple = "HUD";
        return simple + " #" + ord;
    }

    /** True while Pimpin itself registers legacy callbacks; those render through our own editor. */
    public static boolean isOwnRegistering() {
        return ownRegistering;
    }

    public static void setOwnRegistering(boolean value) {
        ownRegistering = value;
    }

    /**
     * Stable key for legacy (pre-1.21.6) callbacks, which carry no id: the first stack
     * frame outside fabric/pimpin/jdk names the mod class that registered the listener,
     * and a per-class ordinal keeps multiple listeners apart.
     */
    public static String legacyKey() {
        String cls = null;
        for (StackTraceElement frame : new Throwable().getStackTrace()) {
            String name = frame.getClassName();
            if (name.startsWith("java.") || name.startsWith("jdk.") || name.startsWith("sun.")
                    || name.startsWith("net.fabricmc.") || name.startsWith("dev.pimpin.")
                    || name.startsWith("org.spongepowered.") || name.startsWith("com.llamalad7.")) continue;
            cls = name;
            break;
        }
        String base = "cls:" + (cls == null ? "unknown" : cls) + "#";
        return base + ORDINALS.merge(base, 1, Integer::sum);
    }

    /** Formats a state chip for the editor: "hidden", "moved +24 -8 120%" or "default". */
    public static String stateText(String key) {
        ForeignPlacement p = state(key);
        if (p == null) return "default";
        if (p.hidden) return "hidden";
        boolean moved = p.dx != 0 || p.dy != 0;
        return String.format(Locale.ROOT, "%s%.0f%%", moved ? "moved " : "", p.scale * 100);
    }
}
