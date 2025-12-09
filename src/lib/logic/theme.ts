// const KANAGAWA_PALETTE = [
//     "#7E9CD8", // Crystal Blue
//     "#98BB6C", // Spring Green
//     "#FF9E3B", // Ronin Yellow
//     "#E6C384", // Carp Yellow
//     "#957FB8", // Oni Violet
//     "#7AA89F", // Wave Aqua
//     "#D27E99", // Sakura Pink
//     "#E46876", // Wave Red
//     "#FFA066", // Surimi Orange
//     "#7FB4CA", // Spring Blue
// ];


const KANAGAWA_PALETTE = [
        "#DCD7BA", "#C8C093",
        //"#223249",
        "#938AA9", 
        // "#54546D", 
        "#98BB6C", 
        "#D27E99", "#FFA066", "#E6C384", "#b8b4d0", "#7E9CD8", "#957FB8", 
        "#C0A36E", "#E46876", "#7AA89F", "#717C7C", "#727169", "#9CABCA", 
        "#7FB4CA", "#FF5D62", "#76946A", "#C34043", "#DCA561", "#E82424", 
        "#FF9E3B", "#658594", "#6A9589", 
        // "#16161D"
    ];

export function getUserColor(id: string): string {
    if (!id) return "#DCD7BA"; // Fuji White (Default)

    // FNV-1a Hash (Same as before, but strictly for ID)
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    
    // Always returns a valid index within the palette
    const index = (hash >>> 0) % KANAGAWA_PALETTE.length;
    return KANAGAWA_PALETTE[index];
}
