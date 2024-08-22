import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { dir } from 'console';
import { Request } from 'express';
import JwtHelper from './jwt-helper';
import { File, IFileInfo } from './database/file';
import { compress } from '@mongodb-js/zstd';
import avsc from 'avsc';
import axios from 'axios';

export const FileListSchema = avsc.Type.forSchema({
  type: 'array',
  items: {
    name: 'files',
    type: 'record',
    fields: [
      {name: 'path', type: 'string'},
      {name: 'hash', type: 'string'},
      {name: 'size', type: 'long'},
      {name: 'lastModified', type: 'long'},
    ],
  },
})

export class Utilities {
    /**
     * 扫描指定目录，返回该目录下所有文件的路径集合
     *
     * @param directoryPath 要扫描的目录路径
     * @return 包含所有文件相对路径的 Set 集合
     */
    public static scanFiles(directoryPath: string): string[] {
        const filePaths: string[] = [];
        directoryPath = path.resolve(directoryPath);
        if (fs.existsSync(directoryPath) && fs.lstatSync(directoryPath).isDirectory()) {
            this.scanDirectory(directoryPath, filePaths, directoryPath);
        }
        return filePaths;
    }

    /**
     * 递归扫描目录及其子目录，收集所有文件的相对路径
     *
     * @param directory 当前扫描的目录
     * @param filePaths 存储文件路径的 Set 集合
     * @param rootPath  根目录路径，用于计算相对路径
     */
    private static scanDirectory(directory: string, filePaths: string[], rootPath: string): void {
        const files = fs.readdirSync(directory);
        files.forEach(file => {
            const fullPath = path.join(directory, file);
            // 忽略以点开头的文件或目录
            if (file.startsWith('.')) {
                return;
            }
            const stats = fs.lstatSync(fullPath);
            if (stats.isFile()) {
                // 计算相对于根目录的路径
                let relativePath = fullPath.substring(rootPath.length).replace(/\\/g, '/');
                if (!relativePath.startsWith('/')) {
                    relativePath = '/' + relativePath;
                }
                relativePath = '/files' + relativePath;
                filePaths.push(relativePath);
            } else if (stats.isDirectory()) {
                // 递归扫描子目录
                this.scanDirectory(fullPath, filePaths, rootPath);
            }
        });
    }

    public static async wait(seconds: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(resolve, seconds * 1000);
        });
    }

    public static async getAvroBytes(files: File[]): Promise<Buffer> {
        return compress(FileListSchema.toBuffer(files as IFileInfo[]));
    }

    public static getRandomElement<T>(array: T[]): T | undefined {
        if (array.length === 0) return undefined; // 如果数组为空，返回 undefined
        const randomIndex = Math.floor(Math.random() * array.length);
        return array[randomIndex];
    }

    public static async checkUrls(urls: string[]): Promise<{ url: string; hash: string }[]> {
        const results: { url: string; hash: string }[] = [];
    
        for (const url of urls) {
            try {
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                const responseData = response.data as Buffer;
    
                // 计算响应数据的哈希值
                const hash = crypto.createHash('sha256').update(responseData).digest('hex');
    
                results.push({ url, hash });

                await this.wait(2); // 限制请求频率
            } catch (error) {
                const err = error as Error;
                console.error(`Error fetching ${url}:`, err.message);
                results.push({ url, hash: 'error' });
            }
        }
    
        return results;
    }
    
    public static getRandomElements<T>(array: T[], count: number, allowDuplicates: boolean = true): T[] {
        const result: T[] = [];

        if (allowDuplicates) {
            for (let i = 0; i < count; i++) {
                const randomIndex = Math.floor(Math.random() * array.length);
                result.push(array[randomIndex]);
            }
        } else {
            if (count > array.length) {
                throw new Error("Count cannot be greater than the number of unique elements in the array when duplicates are not allowed.");
            }

            const tempArray = [...array]; // Create a copy of the array to avoid modifying the original one.
            for (let i = 0; i < count; i++) {
                const randomIndex = Math.floor(Math.random() * tempArray.length);
                result.push(tempArray.splice(randomIndex, 1)[0]);
            }
        }

        return result;
    }

    public static getFileInfoSync(filePath: string): { hash: string, size: number, lastModified: number } {
        try {
            const stats = fs.statSync(filePath);
            const hash = crypto.createHash('sha256');
            let fileSize = 0;
    
            const data = fs.readFileSync(filePath);
            hash.update(data);
            fileSize = data.length;
    
            return {
                hash: hash.digest('hex'),
                size: fileSize,
                lastModified: stats.mtime.getTime()
            };
    
        } catch (err) {
            return { hash: '0000000000000000000000000000000000000000', size: 0, lastModified: 0 };
        }
    }

    public static computeSignature(challenge: string, signature: string, key: string): boolean {
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(challenge);
        const calculatedSignature = hmac.digest('hex').toLowerCase();
        return calculatedSignature === signature.toLowerCase();
    }

    public static verifyClusterRequest(req: Request): boolean {
        return JwtHelper.getInstance().verifyToken(req.headers.authorization?.split(' ').at(-1), 'cluster') instanceof Object;
    }

    public static toUrlSafeBase64String(buffer: Buffer): string {
        return buffer.toString('base64')
            .replace(/\+/g, '-')  // Replace '+' with '-'
            .replace(/\//g, '_')  // Replace '/' with '_'
            .replace(/=+$/, '');  // Remove trailing '='
    }    

    public static getSign(path: string, secret: string): string | null {
        let sha1: crypto.Hash;
        try {
            sha1 = crypto.createHash('sha1');
        } catch (e) {
            console.error(e);
            return null;
        }
        
        const timestamp = Date.now() + 5 * 60 * 1000;
        const e = timestamp.toString(36);
        const signBytes = sha1.update(secret + path + e).digest();
        const sign = Utilities.toUrlSafeBase64String(signBytes);
        
        return `s=${sign}&e=${e}`;
    }
}