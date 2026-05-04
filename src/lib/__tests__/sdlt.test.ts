import { describe, it, expect } from "vitest";
import {
  calculateEnglandNorthernIrelandSdlt,
  getSdltResidenceTypeForInputs
} from "../stampDuty";

describe("calculateEnglandNorthernIrelandSdlt — main residence (standard rates)", () => {
  it("returns £0 for prices up to £125,000", () => {
    expect(calculateEnglandNorthernIrelandSdlt(100000, "main-residence")).toBe(0);
    expect(calculateEnglandNorthernIrelandSdlt(125000, "main-residence")).toBe(0);
  });

  it("returns £0 for a price of £0", () => {
    expect(calculateEnglandNorthernIrelandSdlt(0, "main-residence")).toBe(0);
  });

  it("applies 2% on the portion above £125,000", () => {
    // £200k: 0% on £125k = £0, 2% on £75k = £1,500
    expect(calculateEnglandNorthernIrelandSdlt(200000, "main-residence")).toBe(1500);
  });

  it("applies 5% on the portion above £250,000", () => {
    // £300k: 0% on £125k = £0, 2% on £125k = £2,500, 5% on £50k = £2,500 → £5,000
    expect(calculateEnglandNorthernIrelandSdlt(300000, "main-residence")).toBe(5000);
  });

  it("applies 10% on the portion above £925,000", () => {
    // £1m: 0+2%+5%+10% bands
    // 0% on £125k = £0
    // 2% on £125k = £2,500
    // 5% on £675k = £33,750
    // 10% on £75k = £7,500 → £43,750
    expect(calculateEnglandNorthernIrelandSdlt(1000000, "main-residence")).toBe(43750);
  });
});

describe("calculateEnglandNorthernIrelandSdlt — additional property (higher rates)", () => {
  it("applies 5% from the first pound", () => {
    // £125k: 5% on £125k = £6,250
    expect(calculateEnglandNorthernIrelandSdlt(125000, "additional-property")).toBe(6250);
  });

  it("applies 7% on the 125k–250k band", () => {
    // £250k: 5% on £125k = £6,250, 7% on £125k = £8,750 → £15,000
    expect(calculateEnglandNorthernIrelandSdlt(250000, "additional-property")).toBe(15000);
  });

  it("applies 10% on the 250k–925k band", () => {
    // £300k: 5% on £125k = £6,250, 7% on £125k = £8,750, 10% on £50k = £5,000 → £20,000
    expect(calculateEnglandNorthernIrelandSdlt(300000, "additional-property")).toBe(20000);
  });

  it("applies 15% on the 925k–1.5m band", () => {
    // £1m: 5%+7%+10%+15% bands
    // 5% on £125k = £6,250
    // 7% on £125k = £8,750
    // 10% on £675k = £67,500
    // 15% on £75k = £11,250 → £93,750
    expect(calculateEnglandNorthernIrelandSdlt(1000000, "additional-property")).toBe(93750);
  });
});

describe("getSdltResidenceTypeForInputs", () => {
  const base = {
    propertyGoal: "buy-to-let" as const,
    purchaseStructure: "personal-name" as const,
    personalSdltStatus: "additional-property" as const,
    sdltResidenceType: "main-residence" as const
  };

  it("returns additional-property for limited company BTL", () => {
    expect(getSdltResidenceTypeForInputs({ ...base, purchaseStructure: "limited-company" })).toBe(
      "additional-property"
    );
  });

  it("returns additional-property for personal BTL with additional-property status", () => {
    expect(
      getSdltResidenceTypeForInputs({ ...base, personalSdltStatus: "additional-property" })
    ).toBe("additional-property");
  });

  it("returns main-residence for personal BTL with only-residential-property status", () => {
    expect(
      getSdltResidenceTypeForInputs({ ...base, personalSdltStatus: "only-residential-property" })
    ).toBe("main-residence");
  });

  it("uses sdltResidenceType directly for standard-purchase goal", () => {
    expect(
      getSdltResidenceTypeForInputs({
        ...base,
        propertyGoal: "standard-purchase",
        sdltResidenceType: "additional-property"
      })
    ).toBe("additional-property");
  });
});
