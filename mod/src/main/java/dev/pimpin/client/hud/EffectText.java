package dev.pimpin.client.hud;

import java.util.Locale;

/** Pure formatting, with no wall-clock countdown or fabricated infinite duration. */
public final class EffectText {
    private EffectText() {}

    public static String duration(int ticks, boolean infinite) {
        if (infinite) return "Infinite";
        long seconds = (Math.max(0L, ticks) + 19L) / 20L;
        if (seconds >= 3600) return String.format(Locale.ROOT, "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }

    public static String amplifier(int zeroBased) {
        String[] roman = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"};
        return zeroBased >= 0 && zeroBased < roman.length ? roman[zeroBased] : String.valueOf((long) zeroBased + 1);
    }
}
