package dev.pimpin.client.feature;

import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;

/** Remembers where you last died so the HUD and minimap can point you back. */
public final class DeathTracker {
    private static BlockPos lastDeath;
    private static String lastDimension;
    private static boolean wasDead;

    private DeathTracker() {}

    public static void tick(Minecraft client) {
        if (client.player == null || client.level == null) return;
        boolean dead = client.player.isDeadOrDying();
        if (dead && !wasDead) {
            lastDeath = client.player.blockPosition();
            lastDimension = String.valueOf(client.level.dimension());
        }
        wasDead = dead;
    }

    /** Death spot in the current dimension, or null. */
    public static BlockPos here(Minecraft client) {
        if (lastDeath == null || client.level == null) return null;
        return String.valueOf(client.level.dimension()).equals(lastDimension) ? lastDeath : null;
    }

    public static void clear() {
        lastDeath = null;
    }
}
