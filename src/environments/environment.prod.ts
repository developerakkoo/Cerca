export const environment = {
  production: true,
  apiKey: 'AIzaSyDQq0QpnwQKzDR99ObP1frWj_uRTQ54pbo',
  mapId: 'a51bf22c4d90e515e2bb6a5f',
  apiUrl: 'https://api.myserverdevops.com',
  // apiUrl: 'http://192.168.1.14:3000',
    // Razorpay configuration
    razorpay: {
      // Live keys
      key: 'rzp_live_S6q5OGF0WYChTn',
      // Test keys (commented out for production)
      // key: 'rzp_test_Rp3ejYlVfY449V',
      // Secret: FORM4hrZrQO8JFIiYsQSC83N (for backend use only - do not expose in client-side code)
      // Live Secret: EZv5VecWiWi0FLyffYLDTM3H (for backend use only - do not expose in client-side code)
      name: 'Cerca',
      description: 'Taxi Booking Service',
      theme: { color: '#333652' }
    }
};
