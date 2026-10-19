package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import net.minecraft.client.Minecraft;
import net.minecraft.client.OptionInstance;
import net.minecraft.client.Options;

/**
 * Pimpin FPS booster:
 *  - Background limiter: caps the frame rate while the game window isn't
 *    focused (or is minimised), so your PC stays cool and other apps stay fast.
 *  - One-click boost: switches the heaviest video settings to their fastest
 *    values and remembers your old ones so you can switch back.
 * Enum settings are handled by name, so this works even where Mojang moved
 * or renamed the enum classes.
 */
public final class FpsBooster {
    private static Integer savedLimit;

    private FpsBooster() {}

    public static void tick(Minecraft client) {
        PimpinConfig cfg = PimpinConfig.get();
        boolean background = !client.isWindowActive();
        if (cfg.backgroundFps && background && savedLimit == null) {
            savedLimit = client.options.framerateLimit().get();
            client.options.framerateLimit().set(Math.max(10, Math.min(savedLimit, cfg.backgroundFpsLimit)));
        } else if ((!background || !cfg.backgroundFps) && savedLimit != null) {
            restoreBackgroundLimit(client);
        }
    }

    public static void restoreBackgroundLimit(Minecraft client) {
        if (savedLimit == null) return;
        client.options.framerateLimit().set(savedLimit);
        savedLimit = null;
    }

    public static boolean isBoosted() {
        return PimpinConfig.get().boostActive;
    }

    public static void toggle(Minecraft client) {
        if (isBoosted()) disable(client);
        else enable(client);
    }

    public static void enable(Minecraft client) {
        PimpinConfig cfg = PimpinConfig.get();
        if (cfg.boostActive) return;
        Options o = client.options;
        PimpinConfig.BoostBackup b = new PimpinConfig.BoostBackup();
        b.viewDistance = o.renderDistance().get();
        b.simulationDistance = o.simulationDistance().get();
        b.graphics = enumName(graphics(o));
        b.clouds = enumName(o.cloudStatus());
        b.particles = enumName(o.particles());
        b.entityShadows = o.entityShadows().get();
        b.biomeBlend = o.biomeBlendRadius().get();
        b.entityDistance = o.entityDistanceScaling().get();
        b.ao = o.ambientOcclusion().get();
        cfg.boostBackup = b;
        cfg.boostActive = true;

        o.renderDistance().set(Math.min(b.viewDistance, 8));
        o.simulationDistance().set(Math.min(b.simulationDistance, 6));
        setEnum(graphics(o), "FAST");
        //#if MC >= 1.21.11
        o.applyGraphicsPreset(net.minecraft.client.GraphicsPreset.FAST);
        //#endif
        setEnum(o.cloudStatus(), "OFF");
        setEnum(o.particles(), "MINIMAL");
        o.entityShadows().set(false);
        o.biomeBlendRadius().set(0);
        o.entityDistanceScaling().set(Math.min(b.entityDistance, 0.75));
        o.ambientOcclusion().set(false);
        apply(client, "FPS boost on");
    }

    public static void disable(Minecraft client) {
        PimpinConfig cfg = PimpinConfig.get();
        PimpinConfig.BoostBackup b = cfg.boostBackup;
        cfg.boostActive = false;
        cfg.boostBackup = null;
        if (b == null) {
            PimpinConfig.save();
            return;
        }
        Options o = client.options;
        o.renderDistance().set(b.viewDistance);
        o.simulationDistance().set(b.simulationDistance);
        setEnum(graphics(o), b.graphics);
        //#if MC >= 1.21.11
        if (o.graphicsPreset().get() instanceof net.minecraft.client.GraphicsPreset preset) o.applyGraphicsPreset(preset);
        //#endif
        setEnum(o.cloudStatus(), b.clouds);
        setEnum(o.particles(), b.particles);
        o.entityShadows().set(b.entityShadows);
        o.biomeBlendRadius().set(b.biomeBlend);
        o.entityDistanceScaling().set(b.entityDistance);
        o.ambientOcclusion().set(b.ao);
        apply(client, "FPS boost off, your settings are back");
    }

    /** Graphics mode, or the graphics preset from 1.21.11 on (both have a FAST value). */
    private static OptionInstance<?> graphics(Options o) {
        //#if MC >= 1.21.11
        return o.graphicsPreset();
        //#else
        return o.graphicsMode();
        //#endif
    }

    private static String enumName(OptionInstance<?> option) {
        return option != null && option.get() instanceof Enum<?> e ? e.name() : null;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void setEnum(OptionInstance option, String name) {
        if (option == null || name == null || !(option.get() instanceof Enum<?> current)) return;
        try {
            option.set(Enum.valueOf(current.getDeclaringClass(), name));
        } catch (IllegalArgumentException ignored) {
            // that value doesn't exist in this version; keep the current one
        }
    }

    private static void apply(Minecraft client, String message) {
        PimpinConfig.save();
        client.options.save();
        Compat.reloadChunks(client);
        Compat.actionBar(client, "§d[Pimpin] §f" + message);
    }
}
