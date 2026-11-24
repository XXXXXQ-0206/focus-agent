import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 className：clsx 处理条件，tailwind-merge 消除同类工具类的冲突 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 把数字夹在区间内 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
