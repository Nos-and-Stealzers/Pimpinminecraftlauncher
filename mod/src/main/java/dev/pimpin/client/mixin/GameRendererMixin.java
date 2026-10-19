package dev.pimpin.client.mixin;

import dev.pimpin.client.feature.Zoom;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Zoom: divides the world field of view. It moved from GameRenderer to Camera in 26.1. */
//#if MC >= 26.1
@Mixin(net.minecraft.client.Camera.class)
//#else
@Mixin(net.minecraft.client.renderer.GameRenderer.class)
//#endif
public abstract class GameRendererMixin {
    //#if MC >= 26.1
    @Inject(method = "calculateFov", at = @At("RETURN"), cancellable = true)
    private void pimpin$zoom(float partialTick, CallbackInfoReturnable<Float> cir) {
        double divisor = Zoom.fovDivisor();
        if (divisor != 1.0) cir.setReturnValue((float) (cir.getReturnValue() / divisor));
    }
    //#elseif MC >= 1.21.2
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void pimpin$zoom(net.minecraft.client.Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Float> cir) {
        double divisor = Zoom.fovDivisor();
        if (divisor != 1.0) cir.setReturnValue((float) (cir.getReturnValue() / divisor));
    }
    //#else
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void pimpin$zoom(net.minecraft.client.Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Double> cir) {
        double divisor = Zoom.fovDivisor();
        if (divisor != 1.0) cir.setReturnValue(cir.getReturnValue() / divisor);
    }
    //#endif
}
