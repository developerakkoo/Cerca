import { Ride } from 'src/app/services/ride.service';

export type PreviewRideStatus =
  | 'searching'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed';

const PREVIEW_DRIVER = {
  _id: 'preview-driver-1',
  name: 'Rajesh Kumar',
  phone: '+919876543210',
  rating: 4.8,
  totalTrips: 1240,
  vehicleInfo: {
    make: 'Maruti',
    model: 'Swift Dzire',
    color: 'White',
    licensePlate: 'MH 12 AB 1234',
    year: 2022,
    vehicleType: 'sedan',
  },
};

const PREVIEW_PICKUP: [number, number] = [73.8567, 18.5204];
const PREVIEW_DROPOFF: [number, number] = [73.8795, 18.5314];

export function createPreviewRide(status: PreviewRideStatus): Ride {
  const now = new Date();
  const arrivedAt = new Date(now.getTime() - 3 * 60 * 1000);

  const base: Ride = {
    _id: 'preview-ride-1',
    rider: 'preview-rider-1',
    status,
    pickupLocation: { type: 'Point', coordinates: PREVIEW_PICKUP },
    dropoffLocation: { type: 'Point', coordinates: PREVIEW_DROPOFF },
    pickupAddress: 'FC Road, Shivajinagar, Pune',
    dropoffAddress: 'Phoenix Marketcity, Viman Nagar, Pune',
    fare: 185,
    distanceInKm: 6.2,
    service: 'sedan',
    rideType: 'normal',
    paymentMethod: 'CASH',
    paymentStatus: 'pending',
    startOtp: '1234',
    stopOtp: '5678',
    bookingType: 'INSTANT',
    rideFor: 'SELF',
    createdAt: now,
    updatedAt: now,
  };

  if (status === 'searching') {
    return base;
  }

  const withDriver: Ride = {
    ...base,
    driver: PREVIEW_DRIVER,
  };

  if (status === 'arrived') {
    return {
      ...withDriver,
      driverArrivedAt: arrivedAt,
      pickupWait: {
        waitStartedAt: arrivedAt,
        waitEndedAt: null,
        waitDurationSeconds: 180,
        freeMinutesApplied: 3,
        tier1BillableMinutes: 0,
        tier2BillableMinutes: 0,
        amountTier1: 0,
        amountTier2: 0,
        totalPickupWaitCharge: 0,
      },
    };
  }

  return withDriver;
}
