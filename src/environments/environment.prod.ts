export const environment = {
  production: true,
  apiKey: 'AIzaSyDQq0QpnwQKzDR99ObP1frWj_uRTQ54pbo',
  mapId: 'a51bf22c4d90e515e2bb6a5f',
  apiUrl: 'https://api.cercacars.online',
  // apiUrl: 'http://192.168.1.14:3000',
  devDesign: {
    startAtActiveRide: false,
    defaultPreviewStatus: 'arrived' as const,
  },
  legal: {
    termsUrl: 'https://www.cercacars.in/terms',
    privacyUrl: 'https://www.cercacars.in/privacy',
  },
  razorpay: {
    key: 'rzp_live_S6q5OGF0WYChTn',
    // key: 'rzp_test_Rp3ejYlVfY449V',
    name: 'Cerca',
    description: 'Taxi Booking Service',
    theme: { color: '#333652' },
  },
};
