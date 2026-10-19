package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import net.minecraft.client.Minecraft;

/** Hold the zoom key to zoom in; scroll while zooming to change how far. */
public final class Zoom {
    private static boolean zooming;
    private static boolean savedCinematic;
    private static double scroll = 1.0;
    private static double current = 1.0;
    private static long lastFrame = System.nanoTime();

    private Zoom() {}

    public static void tick(Minecraft client) {
        boolean want = PimpinClient.zoomKey.isDown() && Compat.screen(client) == null && client.player != null;
        if (want && !zooming) {
            savedCinematic = client.options.smoothCamera;
            if (PimpinConfig.get().smoothZoom) client.options.smoothCamera = true;
        } else if (!want && zooming) {
            client.options.smoothCamera = savedCinematic;
            scroll = 1.0;
        }
        zooming = want;
    }

    public static boolean isZooming() {
        return zooming;
    }

    /** Called from the mouse wheel; returns true when the scroll was used for zooming. */
    public static boolean onScroll(double amount) {
        if (!zooming || !PimpinConfig.get().scrollZoom) return false;
        scroll = Math.max(0.25, Math.min(12.0, scroll * (amount > 0 ? 1.25 : 0.8)));
        return true;
    }

    /** Divides the field of view; eased so zooming in and out feels smooth. */
    public static double fovDivisor() {
        long now = System.nanoTime();
        double dt = Math.min(0.1, (now - lastFrame) / 1e9);
        lastFrame = now;
        double target = zooming ? Math.max(1.0, PimpinConfig.get().zoomFactor * scroll) : 1.0;
        if (!PimpinConfig.get().smoothZoom) current = target;
        else current += (target - current) * Math.min(1.0, dt * 14.0);
        if (Math.abs(current - target) < 0.001) current = target;
        return current;
    }
}
