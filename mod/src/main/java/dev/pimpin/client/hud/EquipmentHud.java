package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Draw;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import java.util.ArrayList;
import java.util.List;

/** One existing draggable armour module, with optional hand slots. No cached inventory. */
public final class EquipmentHud {
    private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
    private EquipmentHud() {}

    public static List<ItemStack> items(Minecraft mc, boolean preview) {
        PimpinConfig c = PimpinConfig.get();
        List<ItemStack> result = new ArrayList<>();
        if (preview) {
            var types = new net.minecraft.world.item.Item[]{Items.IRON_HELMET, Items.IRON_CHESTPLATE, Items.IRON_LEGGINGS, Items.IRON_BOOTS};
            for (var type : types) result.add(new ItemStack(type));
            if (c.armorMainHand) result.add(new ItemStack(Items.DIAMOND_PICKAXE));
            if (c.armorOffHand) result.add(new ItemStack(Items.SHIELD));
            for (int i = 0; i < result.size(); i++) {
                var stack = result.get(i);
                stack.setDamageValue(i == result.size() - 1 ? stack.getMaxDamage() * 95 / 100 : stack.getMaxDamage() / 4);
            }
        } else if (mc.player != null) {
            for (var slot : ARMOR) add(result, mc.player.getItemBySlot(slot));
            if (c.armorMainHand) add(result, mc.player.getMainHandItem());
            if (c.armorOffHand) add(result, mc.player.getOffhandItem());
        }
        return result;
    }
    private static void add(List<ItemStack> items, ItemStack stack) {
        if (!stack.isEmpty()) items.add(stack);
    }
    public static String readout(ItemStack stack) {
        if (!stack.isDamageableItem()) return "";
        PimpinConfig c = PimpinConfig.get();
        String text = DurabilityText.format(stack.getMaxDamage(), stack.getDamageValue(), c.armorReadout);
        return low(stack) ? "! " + text : text;
    }
    public static boolean low(ItemStack stack) {
        return stack.isDamageableItem() && DurabilityText.low(stack.getMaxDamage(), stack.getDamageValue(), PimpinConfig.get().armorWarningPercent);
    }
    public static int[] size(Minecraft mc, boolean preview) {
        int w = 62;
        List<ItemStack> items = items(mc, preview);
        for (var stack : items) w = Math.max(w, 24 + mc.font.width(readout(stack)));
        return new int[]{w, Math.max(90, items.size() * 18)};
    }
    public static void render(Draw g, Minecraft mc, int x, int y, boolean preview) {
        var items = items(mc, preview);
        int[] size = size(mc, preview);
        // Bottom alignment retains the old panel's behaviour for missing armour slots.
        int rowY = y + size[1] - items.size() * 18;
        for (var stack : items) {
            boolean low = low(stack);
            if (low) {
                g.fill(x, rowY, x + size[0], rowY + 18, 0x903D161B);
                g.fill(x, rowY, x + 2, rowY + 18, 0xFFFF6666);
            }
            g.item(stack, x + 3, rowY);
            g.itemDecorations(mc.font, stack, x + 3, rowY);
            if (stack.isDamageableItem()) {
                float fraction = DurabilityText.remaining(stack.getMaxDamage(), stack.getDamageValue()) / (float)stack.getMaxDamage();
                int color = low ? 0xFFFF7777 : fraction > .5f ? 0xFF55FF55 : fraction > .2f ? 0xFFFFFF55 : 0xFFFF5555;
                g.text(mc.font, readout(stack), x + 22, rowY + 5, color);
            }
            rowY += 18;
        }
    }
}
