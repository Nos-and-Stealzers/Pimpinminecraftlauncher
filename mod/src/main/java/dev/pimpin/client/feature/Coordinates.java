package dev.pimpin.client.feature;

import dev.pimpin.client.compat.Compat;
import net.minecraft.client.Minecraft;
import net.minecraft.world.level.Level;

/** Always samples the current client world; never stores a previous server's coordinates. */
public final class Coordinates {
    private Coordinates() {}
    public static String text(Minecraft mc, boolean destination) {
        if (mc.player == null || mc.level == null) return null;
        var key = mc.level.dimension();
        boolean overworld = key.equals(Level.OVERWORLD), nether = key.equals(Level.NETHER);
        if (destination && !overworld && !nether) return null;
        String label = overworld ? "Overworld" : nether ? "Nether" : key.equals(Level.END) ? "The End" : Compat.prettyKey(key);
        return CoordinateText.position(label, mc.player.getX(), mc.player.getY(), mc.player.getZ(), destination);
    }
    public static boolean copy(Minecraft mc, boolean destination) {
        String text = text(mc, destination);
        if (text == null) return false;
        // Clipboard write only: never sends chat, commands or network packets.
        Compat.copyText(mc, text);
        return true;
    }
}
