package dev.pimpin.client.hud;

//#if MC < 1.21.6
import dev.pimpin.client.PimpinConfig.ForeignPlacement;
import dev.pimpin.client.compat.Draw;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.gui.GuiGraphics;
//#if MC >= 1.21
import net.minecraft.client.DeltaTracker;
//#endif

/**
 * Wraps HUD content a foreign mod registered through HudRenderCallback
 * (pre-1.21.6). Saves a move/scale/hide transform per registration key and
 * re-reads it from the config each render, so editor edits apply immediately.
 * Kept simple on 1.21.6+, where HudElement wrappers handle everything.
 */
public final class LegacyHudWrapper implements HudRenderCallback {
    private final String key;
    private final HudRenderCallback base;

    private LegacyHudWrapper(String key, HudRenderCallback base) {
        this.key = key;
        this.base = base;
    }

    /**
     * Wraps a freshly registered listener with a stable key derived from the
     * registering mod's own stack frame (see ForeignHuds.legacyKey).
     */
    public static Object wrap(Object listener) {
        if (ForeignHuds.isOwnRegistering()) return listener;
        if (!(listener instanceof HudRenderCallback base)) return listener;
        String key = ForeignHuds.legacyKey();
        ForeignHuds.seen(key);
        return new LegacyHudWrapper(key, base);
    }

    @Override
    //#if MC >= 1.21
    public void onHudRender(GuiGraphics graphics, DeltaTracker tickCounter) {
        draw(graphics, () -> base.onHudRender(graphics, tickCounter));
    }
    //#else
    public void onHudRender(GuiGraphics graphics, float tickDelta) {
        draw(graphics, () -> base.onHudRender(graphics, tickDelta));
    }
    //#endif

    /** Shared draw path: skip when hidden, apply move/scale, always pop the pose. */
    private void draw(Object graphics, Runnable call) {
        ForeignPlacement p = ForeignHuds.state(key);
        if (p == null || p.hidden) return;
        if (p.dx == 0 && p.dy == 0 && p.scale == 1) {
            call.run();
            return;
        }
        Draw d = Draw.of(graphics);
        d.push();
        if (p.dx != 0 || p.dy != 0) d.translate(p.dx, p.dy);
        if (p.scale != 1) d.scale(p.scale);
        try {
            call.run();
        } finally {
            d.pop();
        }
    }
}
//#else
/** Not used on this version (modern hud layers are wrapped by ModernHudWrapper). */
final class LegacyHudWrapper {
    private LegacyHudWrapper() {}

    static Object wrap(Object listener) {
        return listener;
    }
}
//#endif
