import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'search',
    loadChildren: () => import('./pages/search/search.module').then( m => m.SearchPageModule)
  },
  {
    path: 'pin-location',
    loadChildren: () => import('./pages/pin-location/pin-location.module').then( m => m.PinLocationPageModule)
  },
  {
    path: 'gift',
    loadChildren: () => import('./pages/gift/gift.module').then( m => m.GiftPageModule)
  },
  {
    path: 'notifications',
    loadChildren: () => import('./pages/notifications/notifications.module').then( m => m.NotificationsPageModule)
  },
  {
    path: 'cab-searching',
    loadChildren: () => import('./pages/cab-searching/cab-searching.module').then( m => m.CabSearchingPageModule)
  },
  {
    path: 'payment',
    loadChildren: () => import('./pages/payment/payment.module').then( m => m.PaymentPageModule)
  },
  {
    path: 'ride-payment/:rideId',
    loadChildren: () => import('./pages/ride-payment/ride-payment.module').then( m => m.RidePaymentPageModule)
  },
  {
    path: 'active-ordere',
    loadChildren: () => import('./pages/active-ordere/active-ordere.module').then( m => m.ActiveOrderePageModule)
  },
  {
    path: 'cancel-order',
    loadChildren: () => import('./pages/cancel-order/cancel-order.module').then( m => m.CancelOrderPageModule)
  },
  {
    path: 'driver-details',
    loadChildren: () => import('./pages/driver-details/driver-details.module').then( m => m.DriverDetailsPageModule)
  },
  {
    path: 'driver-chat',
    loadChildren: () => import('./pages/driver-chat/driver-chat.module').then( m => m.DriverChatPageModule)
  },
  {
    path: 'splash',
    loadChildren: () => import('./pages/splash/splash.module').then( m => m.SplashPageModule)
  },
  {
    path: 'welcome',
    loadChildren: () => import('./pages/welcome/welcome.module').then( m => m.WelcomePageModule)
  },
  {
    path: '',
    loadChildren: () => import('./pages/auth/mobile-login/mobile-login.module').then( m => m.MobileLoginPageModule)
  },
  {
    path: 'register',
    loadChildren: () => import('./pages/auth/register/register.module').then( m => m.RegisterPageModule)
  },
  {
    path: 'otp',
    loadChildren: () => import('./pages/auth/otp/otp.module').then( m => m.OtpPageModule)
  },
  {
    path: 'mobile-login',
    loadChildren: () => import('./pages/auth/mobile-login/mobile-login.module').then( m => m.MobileLoginPageModule)
  },
  {
    path: 'profile-details/:phoneNumber/:isEdit/:userId',
    loadChildren: () => import('./pages/profile-details/profile-details.module').then( m => m.ProfileDetailsPageModule)
  },
  {
    path: 'view-transactions',
    loadChildren: () => import('./view-transactions/view-transactions.module').then( m => m.ViewTransactionsPageModule)
  },
  {
    path: 'manage-address',
    loadChildren: () => import('./pages/manage-address/manage-address.module').then( m => m.ManageAddressPageModule)
  },
  {
    path: 'blocked',
    loadChildren: () => import('./pages/blocked/blocked.module').then( m => m.BlockedPageModule)
  },
  {
    path: 'shared-ride',
    loadChildren: () => import('./pages/shared-ride/shared-ride.module').then( m => m.SharedRidePageModule)
  },
  {
    path: 'faq',
    loadChildren: () => import('./pages/faq/faq.module').then( m => m.FAQPageModule)
  },
  {
    path: 'maintenance',
    loadChildren: () => import('./pages/maintenance/maintenance.module').then( m => m.MaintenancePageModule)
  },
  {
    path: 'force-update',
    loadChildren: () => import('./pages/force-update/force-update.module').then( m => m.ForceUpdatePageModule)
  },
  {
    path: 'support-list',
    loadChildren: () => import('./pages/support-list/support-list.module').then( m => m.SupportListPageModule)
  },
  {
    path: 'support-chat/:issueId',
    loadChildren: () => import('./pages/support-chat/support-chat.module').then( m => m.SupportChatPageModule)
  },
  {
    path: 'support-feedback/:issueId',
    loadChildren: () => import('./pages/support-feedback/support-feedback.module').then( m => m.SupportFeedbackPageModule)
  },
  {
    path: 'support-list',
    loadChildren: () => import('./pages/support-list/support-list.module').then( m => m.SupportListPageModule)
  },
  {
    path: 'support-chat',
    loadChildren: () => import('./pages/support-chat/support-chat.module').then( m => m.SupportChatPageModule)
  },
  {
    path: 'support-feedback',
    loadChildren: () => import('./pages/support-feedback/support-feedback.module').then( m => m.SupportFeedbackPageModule)
  },

];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
