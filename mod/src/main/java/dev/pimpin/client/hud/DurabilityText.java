package dev.pimpin.client.hud;

/** Shared by the live equipment panel and its layout preview. */
public final class DurabilityText {
    public static final String[] MODES = {"Remaining", "Percent", "Both"};
    private DurabilityText() {}
    public static int remaining(int max, int damage) {
        return Math.max(0, max - Math.max(0, Math.min(max, damage)));
    }
    public static String format(int max, int damage, int mode) {
        if (max <= 0) return "";
        int left = remaining(max, damage);
        int percent = (int)(100L * left / max);
        return mode == 1 ? percent + "%" : mode == 2 ? left + " (" + percent + "%)" : String.valueOf(left);
    }
    public static boolean low(int max, int damage, int threshold) {
        return max > 0 && threshold > 0 && 100L * remaining(max, damage) <= (long)max * Math.min(100, threshold);
    }
}
