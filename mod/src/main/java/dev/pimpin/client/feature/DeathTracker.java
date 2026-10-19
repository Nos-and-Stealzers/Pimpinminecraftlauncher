package dev.pimpin.client.feature;

import net.minecraft.client.MinecraftClient;
import net.minecraft.util.math.BlockPos;

/** Remembers where you last died so the HUD and minimap can point you back. */
public final class DeathTracker {
    private static BlockPos lastDeath;
    private static String lastDimension;
    private static boolean wasDead;

    private DeathTracker() {}

    public static void tick(MinecraftClient client) {
        if (client.player == null || client.world == null) return;
        boolean dead = client.player.isDead();
        if (dead && !wasDead) {
            lastDeath = client.player.getBlockPos();
            lastDimension = client.world.getRegistryKey().getValue().toString();
        }
        wasDead = dead;
    }

    /** Death spot in the current dimension, or null. */
    public static BlockPos here(MinecraftClient client) {
        if (lastDeath == null || client.world == null) return null;
        return client.world.getRegistryKey().getValue().toString().equals(lastDimension) ? lastDeath : null;
    }

    public static void clear() {
        lastDeath = null;
    }
}
