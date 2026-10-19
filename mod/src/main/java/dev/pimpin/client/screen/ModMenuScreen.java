package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.feature.FpsBooster;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModMetadata;
import net.fabricmc.loader.api.metadata.Person;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ConfirmLinkScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/** Built-in mod menu: every loaded mod with its icon, details and links. */
public final class ModMenuScreen extends Screen {
    private static final int ROW = 30;
    private static final Map<String, Optional<Icon>> ICONS = new HashMap<>();
    private record Icon(Identifier id, int w, int h) {}

    private final Screen parent;
    private final List<ModContainer> all;
    private List<ModContainer> shown = new ArrayList<>();
    private ModContainer selected;
    private TextFieldWidget search;
    private ButtonWidget linkButton;
    private ButtonWidget boostButton;
    private boolean showLibraries;
    private double scroll;

    public ModMenuScreen(Screen parent) {
        super(Text.literal("Mods"));
        this.parent = parent;
        this.all = FabricLoader.getInstance().getAllMods().stream()
                .sorted(Comparator.comparing((ModContainer m) -> !m.getMetadata().getId().equals("pimpin"))
                        .thenComparing(m -> m.getMetadata().getName().toLowerCase(Locale.ROOT)))
                .collect(Collectors.toList());
    }

    private static boolean isLibrary(ModContainer m) {
        String id = m.getMetadata().getId();
        if (id.equals("java") || id.equals("minecraft") || id.equals("fabricloader")) return true;
        if (m.getContainingMod().isPresent()) return true; // bundled inside another mod
        return m.getMetadata().containsCustomValue("fabric-api:module-lifecycle") && !id.equals("fabric-api");
    }

    private void filter() {
        String q = search == null ? "" : search.getText().toLowerCase(Locale.ROOT).trim();
        shown = all.stream()
                .filter(m -> showLibraries || !isLibrary(m))
                .filter(m -> q.isEmpty() || m.getMetadata().getName().toLowerCase(Locale.ROOT).contains(q) || m.getMetadata().getId().contains(q))
                .collect(Collectors.toList());
        if (selected == null || !shown.contains(selected)) selected = shown.isEmpty() ? null : shown.get(0);
        scroll = 0;
        updateButtons();
    }

    private int listW() {
        return Math.min(220, width / 2 - 20);
    }

    @Override
    protected void init() {
        int lw = listW();
        String old = search == null ? "" : search.getText();
        search = new TextFieldWidget(textRenderer, 10, 22, lw, 18, Text.literal("Search mods"));
        search.setPlaceholder(Text.literal("Search " + all.size() + " mods…"));
        search.setText(old);
        search.setChangedListener(s -> filter());
        addDrawableChild(search);

        int by = height - 28;
        int bw = Math.min(110, (width - 50) / 5);
        int x = 10;
        addDrawableChild(ButtonWidget.builder(Text.literal("Pimpin settings"), b -> client.setScreen(new PimpinSettingsScreen(this))).dimensions(x, by, bw, 20).build());
        x += bw + 6;
        boostButton = addDrawableChild(ButtonWidget.builder(boostLabel(), b -> {
            FpsBooster.toggle(client);
            b.setMessage(boostLabel());
        }).dimensions(x, by, bw, 20).build());
        x += bw + 6;
        addDrawableChild(ButtonWidget.builder(Text.literal("Mods folder"), b -> Util.getOperatingSystem().open(FabricLoader.getInstance().getGameDir().resolve("mods").toFile())).dimensions(x, by, bw, 20).build());
        x += bw + 6;
        addDrawableChild(ButtonWidget.builder(libLabel(), b -> {
            showLibraries = !showLibraries;
            b.setMessage(libLabel());
            filter();
        }).dimensions(x, by, bw, 20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Done"), b -> close()).dimensions(width - bw - 10, by, bw, 20).build());

        linkButton = addDrawableChild(ButtonWidget.builder(Text.literal("Website"), b -> {
            String url = link(selected);
            if (url != null) ConfirmLinkScreen.open(this, url, true);
        }).dimensions(lw + 30, by - 26, 90, 20).build());
        filter();
    }

    private Text boostLabel() {
        return Text.literal(FpsBooster.isBoosted() ? "FPS boost: §aON" : "FPS boost: OFF");
    }

    private Text libLabel() {
        return Text.literal(showLibraries ? "Hide libraries" : "Show libraries");
    }

    private static String link(ModContainer m) {
        if (m == null) return null;
        var contact = m.getMetadata().getContact();
        return contact.get("homepage").or(() -> contact.get("sources")).or(() -> contact.get("issues")).orElse(null);
    }

    private void updateButtons() {
        if (linkButton != null) linkButton.visible = link(selected) != null;
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        super.render(ctx, mouseX, mouseY, delta);
        int accent = PimpinConfig.get().accent;
        ctx.drawTextWithShadow(textRenderer, "§lPimpin Mod Menu §r§7— " + shown.size() + " shown", 10, 8, 0xFFFFFFFF);

        int lw = listW();
        int top = 46;
        int bottom = height - 36;
        ctx.fill(10, top, 10 + lw, bottom, 0x66000000);
        ctx.enableScissor(10, top, 10 + lw, bottom);
        int y = top - (int) scroll;
        for (ModContainer m : shown) {
            if (y + ROW >= top && y <= bottom) {
                boolean hover = mouseX >= 10 && mouseX < 10 + lw && mouseY >= y && mouseY < y + ROW && mouseY >= top && mouseY < bottom;
                if (m == selected) ctx.fill(10, y, 10 + lw, y + ROW, (accent & 0x00FFFFFF) | 0x55000000);
                else if (hover) ctx.fill(10, y, 10 + lw, y + ROW, 0x33FFFFFF);
                drawIcon(ctx, m, 14, y + 3, 24);
                ModMetadata md = m.getMetadata();
                ctx.drawTextWithShadow(textRenderer, textRenderer.trimToWidth(md.getName(), lw - 46), 42, y + 5, 0xFFFFFFFF);
                ctx.drawTextWithShadow(textRenderer, textRenderer.trimToWidth(md.getVersion().getFriendlyString(), lw - 46), 42, y + 16, 0xFF9A9A9A);
            }
            y += ROW;
        }
        ctx.disableScissor();
        if (shown.isEmpty()) ctx.drawCenteredTextWithShadow(textRenderer, "No mods match", 10 + lw / 2, top + 12, 0xFF9A9A9A);

        if (selected != null) drawDetails(ctx, lw + 30, top, width - lw - 40, bottom - 30 - top);
    }

    private void drawDetails(DrawContext ctx, int x, int y, int w, int h) {
        ModMetadata md = selected.getMetadata();
        drawIcon(ctx, selected, x, y, 40);
        ctx.drawTextWithShadow(textRenderer, "§l" + md.getName(), x + 48, y + 4, 0xFFFFFFFF);
        ctx.drawTextWithShadow(textRenderer, "§7" + md.getId() + "  §8|  §7v" + md.getVersion().getFriendlyString(), x + 48, y + 18, 0xFFFFFFFF);
        String authors = md.getAuthors().stream().map(Person::getName).collect(Collectors.joining(", "));
        int ty = y + 50;
        if (!authors.isEmpty()) {
            for (OrderedText line : textRenderer.wrapLines(Text.literal("§7By §f" + authors), w)) {
                ctx.drawTextWithShadow(textRenderer, line, x, ty, 0xFFFFFFFF);
                ty += 11;
            }
            ty += 4;
        }
        String desc = md.getDescription().isEmpty() ? "No description." : md.getDescription();
        for (OrderedText line : textRenderer.wrapLines(Text.literal(desc), w)) {
            if (ty > y + h - 12) break;
            ctx.drawTextWithShadow(textRenderer, line, x, ty, 0xFFDDDDDD);
            ty += 11;
        }
        if (md.getId().equals("pimpin")) {
            ty += 6;
            for (String tip : new String[]{"§dRight Shift§7 opens this menu", "§dC§7 zoom (scroll to adjust)", "§dM§7 minimap, §dN§7 minimap zoom"}) {
                if (ty > y + h - 12) break;
                ctx.drawTextWithShadow(textRenderer, tip, x, ty, 0xFFFFFFFF);
                ty += 11;
            }
        }
    }

    private void drawIcon(DrawContext ctx, ModContainer m, int x, int y, int size) {
        Optional<Icon> icon = ICONS.computeIfAbsent(m.getMetadata().getId(), id -> loadIcon(m));
        if (icon.isPresent()) {
            Icon i = icon.get();
            ctx.drawTexture(RenderLayer::getGuiTextured, i.id(), x, y, 0f, 0f, size, size, i.w(), i.h(), i.w(), i.h());
        } else {
            String name = m.getMetadata().getName();
            int hue = (name.hashCode() & 0xFFFFFF) | 0xFF404040;
            ctx.fill(x, y, x + size, y + size, hue);
            ctx.drawCenteredTextWithShadow(textRenderer, name.isEmpty() ? "?" : name.substring(0, 1).toUpperCase(Locale.ROOT), x + size / 2, y + (size - 8) / 2, 0xFFFFFFFF);
        }
    }

    private Optional<Icon> loadIcon(ModContainer m) {
        try {
            Optional<String> path = m.getMetadata().getIconPath(64);
            if (path.isEmpty()) return Optional.empty();
            Optional<Path> file = m.findPath(path.get());
            if (file.isEmpty() || !Files.exists(file.get())) return Optional.empty();
            try (InputStream in = Files.newInputStream(file.get())) {
                NativeImage img = NativeImage.read(in);
                String safe = m.getMetadata().getId().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_.-]", "_");
                Identifier id = Identifier.of("pimpin", "modicon/" + safe);
                client.getTextureManager().registerTexture(id, new NativeImageBackedTexture(img));
                return Optional.of(new Icon(id, img.getWidth(), img.getHeight()));
            }
        } catch (Exception e) {
            PimpinClient.LOG.debug("No icon for {}", m.getMetadata().getId(), e);
            return Optional.empty();
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        int lw = listW();
        int top = 46;
        int bottom = height - 36;
        if (mouseX >= 10 && mouseX < 10 + lw && mouseY >= top && mouseY < bottom) {
            int index = (int) ((mouseY - top + scroll) / ROW);
            if (index >= 0 && index < shown.size()) {
                selected = shown.get(index);
                updateButtons();
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        int visible = height - 36 - 46;
        double max = Math.max(0, shown.size() * ROW - visible);
        scroll = Math.max(0, Math.min(max, scroll - verticalAmount * ROW));
        return true;
    }

    @Override
    public void close() {
        client.setScreen(parent);
    }
}
