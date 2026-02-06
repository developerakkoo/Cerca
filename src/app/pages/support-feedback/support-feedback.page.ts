import { Component, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AlertController, LoadingController, ToastController } from '@ionic/angular'
import { SupportService } from '../../services/support.service'
import { UserService } from '../../services/user.service'

@Component({
  selector: 'app-support-feedback',
  templateUrl: './support-feedback.page.html',
  styleUrls: ['./support-feedback.page.scss'],
  standalone: false,
})
export class SupportFeedbackPage implements OnInit {
  issueId: string = ''
  rating: number = 0
  comment: string = ''
  resolved: boolean | string = true // Can be boolean or string from ion-segment
  user: any
  isSubmitting = false

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supportService: SupportService,
    private userService: UserService,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.issueId = this.route.snapshot.paramMap.get('issueId') || ''
    this.loadUser()
  }

  loadUser() {
    this.userService.getUser().subscribe(user => {
      this.user = user
    })
  }

  setRating(value: number) {
    this.rating = value
  }

  async submitFeedback() {
    if (!this.rating || this.rating < 1 || this.rating > 10) {
      const alert = await this.alertController.create({
        header: 'Rating Required',
        message: 'Please provide a rating between 1 and 10.',
        buttons: ['OK']
      })
      await alert.present()
      return
    }

    if (!this.user?.id) {
      const alert = await this.alertController.create({
        header: 'Error',
        message: 'User not found. Please login again.',
        buttons: ['OK']
      })
      await alert.present()
      return
    }

    this.isSubmitting = true
    const loading = await this.loadingController.create({
      message: 'Submitting feedback...'
    })
    await loading.present()

    try {
      // Convert resolved to boolean (ion-segment returns string)
      const resolvedValue = this.resolved === true || this.resolved === 'true' || String(this.resolved).toLowerCase() === 'true'
      
      this.supportService.submitFeedback(
        this.user.id,
        this.issueId,
        this.rating,
        this.comment,
        resolvedValue
      ).subscribe({
        next: async (response) => {
          await loading.dismiss()
          this.isSubmitting = false

          const alert = await this.alertController.create({
            header: 'Thank You!',
            message: 'Your feedback has been submitted successfully.',
            buttons: [
              {
                text: 'OK',
                handler: () => {
                  this.router.navigate(['/support-list'])
                }
              }
            ]
          })
          await alert.present()
        },
        error: async (error) => {
          await loading.dismiss()
          this.isSubmitting = false

          console.error('Error submitting feedback:', error)
          const alert = await this.alertController.create({
            header: 'Error',
            message: error.error?.message || 'Failed to submit feedback. Please try again.',
            buttons: ['OK']
          })
          await alert.present()
        }
      })
    } catch (error) {
      await loading.dismiss()
      this.isSubmitting = false
    }
  }
}
