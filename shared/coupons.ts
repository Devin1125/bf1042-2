export const breakfastCouponCatalog = [
  {
    code: "SUNNY10",
    label: "陽光早餐折 $10",
    discount: 10,
  },
  {
    code: "MILKTEA15",
    label: "奶茶搭餐折 $15",
    discount: 15,
  },
  {
    code: "FULLMORNING20",
    label: "元氣滿滿折 $20",
    discount: 20,
  },
] as const;

export type BreakfastCoupon = (typeof breakfastCouponCatalog)[number];

export function getBreakfastCouponByCode(
  couponCode?: string,
): BreakfastCoupon | undefined {
  if (!couponCode) {
    return undefined;
  }

  return breakfastCouponCatalog.find((coupon) => coupon.code === couponCode);
}
