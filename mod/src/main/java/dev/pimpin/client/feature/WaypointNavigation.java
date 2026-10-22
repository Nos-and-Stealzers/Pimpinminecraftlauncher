package dev.pimpin.client.feature;

import dev.pimpin.client.compat.Draw;
import net.minecraft.client.Minecraft;
import java.util.Locale;

/** Call once from the client HUD; safe when not joined or selection is stale. */
public final class WaypointNavigation {
    private WaypointNavigation() { }
    public static void render(Draw g, Minecraft mc) {
        if (mc.player == null || mc.level == null || !WaypointPreferences.navigation()) return;
        Waypoints.Target p = Waypoints.selectedTarget(mc);
        if (p == null) return;
        int w = Math.min(244, g.width() - 16), x = (g.width() - w) / 2, y = 38;
        double distance = Waypoints.distance(mc, p);
        double dx = p.x() - mc.player.getX(), dz = p.z() - mc.player.getZ();
        double bearing = Math.toDegrees(Math.atan2(-dx, dz));
        double relative = ((bearing - mc.player.getYRot() + 540) % 360 + 360) % 360 - 180;
        String direction = Math.hypot(dx, dz) < 3 ? "Here" : Math.abs(relative) < 15 ? "Ahead" : Math.abs(relative) > 150 ? "Behind" : relative > 0 ? "Right >" : "< Left";
        String vertical = "Y " + p.y() + " (" + String.format(Locale.ROOT, "%+.0f", p.y() - mc.player.getY()) + ")";
        String range = String.format(Locale.ROOT, distance >= 1000 ? "%.1f km" : "%.0f m", distance >= 1000 ? distance / 1000 : distance);
        g.fill(x, y, x + w, y + 32, 0xD01A2028);
        g.fill(x, y, x + 3, y + 32, p.color());
        g.text(mc.font, mc.font.plainSubstrByWidth(p.name(), w - 16), x + 8, y + 5, p.color());
        g.text(mc.font, mc.font.plainSubstrByWidth(direction + " · " + range + " · " + vertical, w - 16), x + 8, y + 19, 0xFFE5EAF0);
    }
}
