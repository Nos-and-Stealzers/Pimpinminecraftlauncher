package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Effects;
import net.minecraft.client.Minecraft;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Read-only view of the current player's synchronized effects. No cross-world cache. */
public final class EffectsHud {
    private EffectsHud() {}

    public static List<String> lines(Minecraft client, int width, int availableRows) {
        List<String> lines = new ArrayList<>();
        if (!PimpinConfig.get().effectHud || client.player == null || client.level == null || availableRows <= 0) return lines;
        List<MobEffectInstance> effects = new ArrayList<>(client.player.getActiveEffects());
        effects.removeIf(e -> !e.isInfiniteDuration() && e.getDuration() <= 0);
        effects.sort(Comparator.comparing((MobEffectInstance e) -> Effects.type(e).getDisplayName().getString())
                .thenComparingInt(MobEffectInstance::getAmplifier));
        int limit = Math.min(PimpinConfig.get().effectHudRows, availableRows);
        int shown = Math.min(effects.size(), limit);
        if (effects.size() > limit) shown = Math.max(0, limit - 1);
        for (int i = 0; i < shown; i++) {
            MobEffectInstance e = effects.get(i);
            var type = Effects.type(e);
            String color = type.getCategory() == MobEffectCategory.BENEFICIAL ? "§a" : type.getCategory() == MobEffectCategory.HARMFUL ? "§c" : "§e";
            String suffix = " " + EffectText.amplifier(e.getAmplifier()) + " §f" + EffectText.duration(e.getDuration(), e.isInfiniteDuration());
            String name = client.font.plainSubstrByWidth(type.getDisplayName().getString(), Math.max(20, width - client.font.width(suffix)));
            lines.add(color + name + suffix);
        }
        if (shown < effects.size()) lines.add("§7+" + (effects.size() - shown) + " more effects");
        return lines;
    }
}
