/**
 * Reads the contents of a folder and returns a JSON string that represents the folder structure.
 * @param fs The file system module.
 * @param path The path module.
 * @param folderPath The path of the folder to read.
 * @returns A JSON string that represents the folder structure.
 */
function readFolder(fs: typeof import('fs'), path: typeof import('pathe'), folderPath: string): any {
    const files = fs.readdirSync(folderPath)
    const result: any = {}

    for (const file of files) {
        const filePath = path.join(folderPath, file)
        const stats = fs.statSync(filePath)
        // console.log(file)
        if (stats.isDirectory()) {
            result[file] = readFolder(fs, path, filePath)
        } else if (stats.isFile() && path.extname(file) === '.txt') {
            const contents = fs
                .readFileSync(filePath, 'utf-8')
                .split('\n')
                .map((line) => line.replace(/\r/g, ''))
            const fileName = path.basename(file, '.txt')
            result[fileName] = contents
        }
    }

    return result
}

export default readFolder
