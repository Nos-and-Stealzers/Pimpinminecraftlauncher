package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.feature.LauncherNotices;
import dev.pimpin.client.feature.LauncherNotices.Notice;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.util.FormattedCharSequence;

import java.util.List;

/**
 * One launcher notice at a time, top right, under the first vanilla toast slot (or under a
 * minimap placed there). Flat dark panel, thin accent bar, short fade and slide. Silent.
 */
public final class NoticeHud {
    private static final int WIDTH = 210;
    private static final int PAD = 7;
    private static final int TOAST_SLOT = 32;
    private static final int FADE_IN = 220;
    private static final int FADE_OUT = 320;
    private static final int SLIDE = 8;
    private static final int NEUTRAL = 0xFF8A8A96;

    private NoticeHud() {}

    /** True when a notice may be drawn and its time may run: in a world, HUD shown, no menu. */
    public static boolean canShow(Minecraft mc) {
        return PimpinConfig.get().launcherNotices && mc.player != null && mc.level != null
                && Compat.screen(mc) == null && !Compat.hudHidden(mc) && !Minimap.bigMapOpen(mc);
    }

    public static void render(Draw g) {
        Minecraft mc = Minecraft.getInstance();
        Notice n = LauncherNotices.frame(canShow(mc));
        if (n == null) return;
        long t = LauncherNotices.shownMillis();
        float in = ease(Math.min(1f, t / (float) FADE_IN));
        float out = ease(Math.min(1f, Math.max(0f, (LauncherNotices.SHOW_MILLIS - t) / (float) FADE_OUT)));
        float a = Math.min(in, out);
        if (a <= 0.02f) return;
        draw(g, mc, n, a, Math.round((1f - a) * SLIDE));
    }

    /** Panel rectangle {x, y, w, h} for the current screen, before any slide offset. */
    public static int[] bounds(Minecraft mc, Notice n, int sw, int sh) {
        Font font = mc.font;
        int w = Math.max(80, Math.min(WIDTH, sw - 8));
        int textW = w - PAD * 2 - 2;
        int h = height(font, n, textW);
        int x = sw - w - 4;
        int y = TOAST_SLOT + 4;
        PimpinConfig c = PimpinConfig.get();
        if (c.minimap) {
            int mapH = c.minimapSize + (c.minimapCoords ? 16 : 0);
            int[] m = HudLayout.bounds(4, sw, sh, c.minimapSize, mapH);
            if (overlaps(x, y, w, h, m)) {
                if (m[1] + m[3] + 4 + h <= sh - 4) y = m[1] + m[3] + 4;
                else if (m[0] - w - 4 >= 4) x = m[0] - w - 4;
            }
        }
        return new int[]{x, y, w, h};
    }

    private static boolean overlaps(int x, int y, int w, int h, int[] r) {
        return x < r[0] + r[2] && r[0] < x + w && y < r[1] + r[3] && r[1] < y + h;
    }

    private static List<FormattedCharSequence> lines(Font font, String s, int width, int max) {
        if (s.isEmpty()) return List.of();
        List<FormattedCharSequence> all = font.split(FormattedText.of(s), width);
        return all.size() > max ? all.subList(0, max) : all;
    }

    private static int height(Font font, Notice n, int textW) {
        int lh = font.lineHeight + 1;
        int titles = lines(font, n.title(), textW, 2).size();
        int bodies = lines(font, n.body(), textW, 5).size();
        return PAD + titles * lh + (bodies > 0 ? 3 + bodies * lh : 0) + PAD - 2;
    }

    private static void draw(Draw g, Minecraft mc, Notice n, float a, int slide) {
        Font font = mc.font;
        int[] b = bounds(mc, n, g.width(), g.height());
        int x = b[0] + slide, y = b[1], w = b[2], h = b[3];
        int textW = w - PAD * 2 - 2;
        int accent = n.knownKind() ? PimpinConfig.get().accent : NEUTRAL;
        g.fill(x, y, x + w, y + h, alpha(0xEC141418, a));
        g.fill(x, y, x + w, y + 1, alpha(0x18FFFFFF, a));
        g.fill(x, y, x + 2, y + h, alpha(accent | 0xFF000000, a));
        if (a < 0.12f) return; // nearly transparent text renders opaque on some versions
        int lh = font.lineHeight + 1;
        int tx = x + 2 + PAD, ty = y + PAD;
        for (FormattedCharSequence line : lines(font, n.title(), textW, 2)) {
            g.text(font, line, tx, ty, alpha(0xFFF2F2F5, a), false);
            ty += lh;
        }
        List<FormattedCharSequence> body = lines(font, n.body(), textW, 5);
        if (!body.isEmpty()) ty += 3;
        for (FormattedCharSequence line : body) {
            g.text(font, line, tx, ty, alpha(0xFFADADB8, a), false);
            ty += lh;
        }
    }

    private static int alpha(int argb, float a) {
        int base = argb >>> 24;
        return (Math.round(base * a) << 24) | (argb & 0xFFFFFF);
    }

    private static float ease(float t) {
        float u = 1f - t;
        return 1f - u * u * u;
    }
}
