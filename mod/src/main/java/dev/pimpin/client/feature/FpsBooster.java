package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.CloudRenderMode;
import net.minecraft.client.option.GameOptions;
import net.minecraft.client.option.GraphicsMode;
import net.minecraft.particle.ParticlesMode;
import net.minecraft.text.Text;

/**
 * Pimpin FPS booster:
 *  - Background limiter: caps the frame rate while the game window isn't
 *    focused (or is minimised), so your PC stays cool and other apps stay fast.
 *  - One-click boost: switches the heaviest video settings to their fastest
 *    values and remembers your old ones so you can switch back.
 */
public final class FpsBooster {
    private static Integer savedLimit;

    private FpsBooster() {}

    public static void tick(MinecraftClient client) {
        PimpinConfig cfg = PimpinConfig.get();
        boolean background = !client.isWindowFocused();
        if (cfg.backgroundFps && background && savedLimit == null) {
            savedLimit = client.options.getMaxFps().getValue();
            client.options.getMaxFps().setValue(Math.max(5, Math.min(savedLimit, cfg.backgroundFpsLimit)));
        } else if ((!background || !cfg.backgroundFps) && savedLimit != null) {
            restoreBackgroundLimit(client);
        }
    }

    public static void restoreBackgroundLimit(MinecraftClient client) {
        if (savedLimit == null) return;
        client.options.getMaxFps().setValue(savedLimit);
        savedLimit = null;
    }

    public static boolean isBoosted() {
        return PimpinConfig.get().boostActive;
    }

    public static void toggle(MinecraftClient client) {
        if (isBoosted()) disable(client);
        else enable(client);
    }

    public static void enable(MinecraftClient client) {
        PimpinConfig cfg = PimpinConfig.get();
        if (cfg.boostActive) return;
        GameOptions o = client.options;
        PimpinConfig.BoostBackup b = new PimpinConfig.BoostBackup();
        b.viewDistance = o.getViewDistance().getValue();
        b.simulationDistance = o.getSimulationDistance().getValue();
        b.graphics = o.getGraphicsMode().getValue().name();
        b.clouds = o.getCloudRenderMode().getValue().name();
        b.particles = o.getParticles().getValue().name();
        b.entityShadows = o.getEntityShadows().getValue();
        b.biomeBlend = o.getBiomeBlendRadius().getValue();
        b.entityDistance = o.getEntityDistanceScaling().getValue();
        b.ao = o.getAo().getValue();
        cfg.boostBackup = b;
        cfg.boostActive = true;

        o.getViewDistance().setValue(Math.min(b.viewDistance, 8));
        o.getSimulationDistance().setValue(Math.min(b.simulationDistance, 6));
        o.getGraphicsMode().setValue(GraphicsMode.FAST);
        o.getCloudRenderMode().setValue(CloudRenderMode.OFF);
        o.getParticles().setValue(ParticlesMode.MINIMAL);
        o.getEntityShadows().setValue(false);
        o.getBiomeBlendRadius().setValue(0);
        o.getEntityDistanceScaling().setValue(Math.min(b.entityDistance, 0.75));
        o.getAo().setValue(false);
        apply(client, "FPS boost on");
    }

    public static void disable(MinecraftClient client) {
        PimpinConfig cfg = PimpinConfig.get();
        PimpinConfig.BoostBackup b = cfg.boostBackup;
        cfg.boostActive = false;
        cfg.boostBackup = null;
        if (b == null) {
            PimpinConfig.save();
            return;
        }
        GameOptions o = client.options;
        o.getViewDistance().setValue(b.viewDistance);
        o.getSimulationDistance().setValue(b.simulationDistance);
        o.getGraphicsMode().setValue(safe(GraphicsMode.class, b.graphics, GraphicsMode.FANCY));
        o.getCloudRenderMode().setValue(safe(CloudRenderMode.class, b.clouds, CloudRenderMode.FANCY));
        o.getParticles().setValue(safe(ParticlesMode.class, b.particles, ParticlesMode.ALL));
        o.getEntityShadows().setValue(b.entityShadows);
        o.getBiomeBlendRadius().setValue(b.biomeBlend);
        o.getEntityDistanceScaling().setValue(b.entityDistance);
        o.getAo().setValue(b.ao);
        apply(client, "FPS boost off — your settings are back");
    }

    private static void apply(MinecraftClient client, String message) {
        PimpinConfig.save();
        client.options.write();
        if (client.worldRenderer != null) client.worldRenderer.reload();
        if (client.player != null) client.player.sendMessage(Text.literal("§d[Pimpin] §f" + message), true);
    }

    private static <E extends Enum<E>> E safe(Class<E> type, String name, E fallback) {
        try {
            return Enum.valueOf(type, name);
        } catch (Exception e) {
            return fallback;
        }
    }
}
