package dev.pimpin.client.compat;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;

/** Registry holders replaced direct effect objects in 1.20.5. */
public final class Effects {
    private Effects() {}

    public static MobEffect type(MobEffectInstance instance) {
        //#if MC >= 1.20.5
        return instance.getEffect().value();
        //#else
        return instance.getEffect();
        //#endif
    }
}
