package dev.pimpin.client.compat;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.Level;

import java.net.URI;

/** Small calls whose names or shapes changed between Minecraft versions. */
public final class Compat {
    private Compat() {}

    public static net.minecraft.client.gui.screens.Screen screen(Minecraft mc) {
        //#if MC >= 26.2
        return mc.gui.screen();
        //#else
        return mc.screen;
        //#endif
    }

    public static void setScreen(Minecraft mc, net.minecraft.client.gui.screens.Screen screen) {
        //#if MC >= 26.2
        mc.gui.setScreen(screen);
        //#else
        mc.setScreen(screen);
        //#endif
    }

    /** F1: the player hid the HUD. */
    public static boolean hudHidden(Minecraft mc) {
        //#if MC >= 26.2
        return mc.gui.hud.isHidden();
        //#else
        return mc.options.hideGui;
        //#endif
    }

    /** Re-builds chunk meshes after video settings change (newer versions do this by themselves). */
    public static void reloadChunks(Minecraft mc) {
        //#if MC < 26.2
        if (mc.levelRenderer != null) mc.levelRenderer.allChanged();
        //#endif
    }

    public static boolean debugScreenOpen(Minecraft mc) {
        //#if MC >= 1.20.2
        return mc.getDebugOverlay().showDebugScreen();
        //#else
        return mc.options.renderDebug;
        //#endif
    }

    public static int minY(Level level) {
        //#if MC >= 1.21.2
        return level.getMinY();
        //#else
        return level.getMinBuildHeight();
        //#endif
    }

    public static void actionBar(Minecraft mc, String text) {
        if (mc.player == null) return;
        //#if MC >= 26.1
        mc.player.sendOverlayMessage(Component.literal(text));
        //#else
        mc.player.displayClientMessage(Component.literal(text), true);
        //#endif
    }

    public static void open(URI uri) {
        //#if MC >= 26.3
        com.mojang.blaze3d.Blaze3D.openUri(uri);
        //#elseif MC >= 1.21.11
        net.minecraft.util.Util.getPlatform().openUri(uri);
        //#else
        net.minecraft.Util.getPlatform().openUri(uri);
        //#endif
    }

    /** "minecraft:dark_forest" → "Dark forest", from a ResourceKey's text form. */
    public static String prettyKey(Object key) {
        String s = String.valueOf(key);
        int slash = s.lastIndexOf('/');
        if (slash >= 0) s = s.substring(slash + 1);
        s = s.replace("]", "").trim();
        int colon = s.lastIndexOf(':');
        if (colon >= 0) s = s.substring(colon + 1);
        s = s.replace('_', ' ');
        return s.isEmpty() ? "Unknown" : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
