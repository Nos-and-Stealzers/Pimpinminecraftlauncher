package dev.pimpin.client.feature;

import java.util.UUID;

/** Minecraft-independent persisted marker and input validation. */
public class WaypointRecord {
    public String id = UUID.randomUUID().toString();
    public String name;
    public int x, y, z, color;
    public boolean shown = true;

    public static String validName(String input) {
        if (input == null) throw new IllegalArgumentException("Enter a name.");
        String value = input.strip();
        if (value.isEmpty() || value.length() > 48) throw new IllegalArgumentException("Name must be 1–48 characters.");
        if (value.codePoints().anyMatch(c -> Character.isISOControl(c) || c == 167))
            throw new IllegalArgumentException("Name cannot contain control or formatting codes.");
        return value;
    }

    public static int coordinate(String value, boolean vertical) {
        if (value == null || !value.strip().matches("[+-]?[0-9]{1,8}"))
            throw new IllegalArgumentException("Coordinates must be whole numbers.");
        int result;
        try { result = Integer.parseInt(value.strip()); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("Coordinate is too large."); }
        int limit = vertical ? 2048 : 30000000;
        if (result < -limit || result > limit)
            throw new IllegalArgumentException(vertical ? "Y must be between -2048 and 2048." : "X/Z must be within ±30,000,000.");
        return result;
    }

    public void validate() {
        validName(name);
        coordinate(Integer.toString(x), false);
        coordinate(Integer.toString(y), true);
        coordinate(Integer.toString(z), false);
        if (id == null || id.isBlank()) id = UUID.randomUUID().toString();
    }
}
