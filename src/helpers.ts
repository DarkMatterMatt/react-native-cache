/**
 * Calculate number of bytes in string
 * @param str the string to calculate the size of
 * @see https://stackoverflow.com/a/23329386/6595777
 */
export default function byteLength(str: string) {
    let bytes = str.length;
    for (let i = str.length - 1; i >= 0; i--) {
        const code = str.charCodeAt(i);
        if (code > 0x7F && code <= 0x7FF) {
            bytes += 1;
        }
        else if (code > 0x7FF && code <= 0xFFFF) {
            bytes += 2;
        }
    }
    return bytes;
}
