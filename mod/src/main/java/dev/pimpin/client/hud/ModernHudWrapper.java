package dev.pimpin.client.hud;

//#if MC >= 1.21.6
import dev.pimpin.client.PimpinConfig.ForeignPlacement;
import dev.pimpin.client.compat.Draw;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.DeltaTracker;
//#if MC >= 26.1
import net.minecraft.client.gui.GuiGraphicsExtractor;
//#else
import net.minecraft.client.gui.GuiGraphics;
//#endif

/**
 * Wraps HUD content a foreign mod registered on Fabric's hud registry (1.21.6+).
 * Saves a move/scale/hide transform per element id and re-reads it from the
 * config each render, so edits in the editor take effect immediately.
 * Empty on older versions — legacy callbacks are wrapped by LegacyHudWrapper.
 */
public final class ModernHudWrapper implements HudElement {
    private final String key;
    private final HudElement base;

    private ModernHudWrapper(String key, HudElement base) {
        this.key = key;
        this.base = base;
    }

    /**
     * Wraps a freshly registered foreign layer element. The id turns into the
     * "mod:namespace:path" key; Pimpin's own registrations are left untouched.
     */
    public static Object wrap(Object id, Object element) {
        if (!(element instanceof HudElement base)) return element;
        String key = "mod:" + id;
        if (key.startsWith("mod:pimpin:")) return element;
        ForeignHuds.seen(key);
        return new ModernHudWrapper(key, base);
    }

    @Override
    //#if MC >= 26.1
    public void extractRenderState(GuiGraphicsExtractor graphics, DeltaTracker tickCounter) {
        draw(graphics, tickCounter, () -> base.extractRenderState(graphics, tickCounter));
    }
    //#else
    public void render(GuiGraphics graphics, DeltaTracker tickCounter) {
        draw(graphics, tickCounter, () -> base.render(graphics, tickCounter));
    }
    //#endif

    /** Shared draw path: skip when hidden, apply move/scale, always pop the pose. */
    private void draw(Object graphics, Object tickCounter, Runnable call) {
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
/** Not used on this version (legacy callbacks are wrapped by LegacyHudWrapper). */
final class ModernHudWrapper {
    private ModernHudWrapper() {}
}
//#endif
