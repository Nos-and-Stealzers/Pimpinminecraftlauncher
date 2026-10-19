package dev.pimpin.client.mixin;

import dev.pimpin.client.feature.Zoom;
import dev.pimpin.client.hud.PimpinHud;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.Mouse;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mouse.class)
public abstract class MouseMixin {
    @Inject(method = "onMouseScroll", at = @At("HEAD"), cancellable = true)
    private void pimpin$scrollZoom(long window, double horizontal, double vertical, CallbackInfo ci) {
        if (MinecraftClient.getInstance().currentScreen == null && vertical != 0 && Zoom.onScroll(vertical)) ci.cancel();
    }

    @Inject(method = "onMouseButton", at = @At("HEAD"))
    private void pimpin$countClicks(long window, int button, int action, int mods, CallbackInfo ci) {
        if (action == 1 && MinecraftClient.getInstance().currentScreen == null) PimpinHud.click(button);
    }
}
