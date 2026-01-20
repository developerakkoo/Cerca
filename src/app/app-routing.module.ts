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
    loadChildren: () => import('./pages/auth/login/login.module').then( m => m.LoginPageModule)
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

];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
