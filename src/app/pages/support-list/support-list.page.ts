import { Component, OnInit, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import { AlertController, LoadingController, ToastController } from '@ionic/angular'
import { SupportService, SupportIssue } from '../../services/support.service'
import { UserService } from '../../services/user.service'
import { SocketService } from '../../services/socket.service'
import { Subscription } from 'rxjs'

@Component({
  selector: 'app-support-list',
  templateUrl: './support-list.page.html',
  styleUrls: ['./support-list.page.scss'],
  standalone: false,
})
export class SupportListPage implements OnInit, OnDestroy {
  issues: SupportIssue[] = []
  filteredIssues: SupportIssue[] = []
  selectedFilter: 'all' | 'active' | 'resolved' = 'all'
  isLoading = false
  user: any
  unreadCounts: Map<string, number> = new Map()
  private subscriptions: Subscription[] = []

  constructor(
    private supportService: SupportService,
    private userService: UserService,
    private socketService: SocketService,
    private router: Router,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadUser()
    this.setupSocketListeners()
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe())
  }

  loadUser() {
    const sub = this.userService.getUser().subscribe(user => {
      this.user = user
      if (user?.id) {
        this.loadIssues()
      }
    })
    this.subscriptions.push(sub)
  }

  async loadIssues() {
    if (!this.user?.id) return

    this.isLoading = true
    try {
      const sub = this.supportService.getUserIssues(this.user.id).subscribe({
        next: (issues) => {
          this.issues = issues
          this.applyFilter()
          this.isLoading = false
        },
        error: async (error) => {
          console.error('Error loading issues:', error)
          this.isLoading = false
          const toast = await this.toastController.create({
            message: 'Failed to load support issues',
            duration: 2000,
            color: 'danger'
          })
          await toast.present()
        }
      })
      this.subscriptions.push(sub)
    } catch (error) {
      this.isLoading = false
    }
  }

  async refreshIssues() {
    await this.loadIssues()
  }

  applyFilter() {
    switch (this.selectedFilter) {
      case 'active':
        this.filteredIssues = this.issues.filter(issue =>
          ['WAITING_FOR_ADMIN', 'ADMIN_ASSIGNED', 'CHAT_ACTIVE', 'FEEDBACK_PENDING'].includes(issue.status)
        )
        break
      case 'resolved':
        this.filteredIssues = this.issues.filter(issue =>
          ['RESOLVED', 'ESCALATED'].includes(issue.status)
        )
        break
      default:
        this.filteredIssues = this.issues
    }
  }

  onFilterChange(event: any) {
    this.selectedFilter = event.detail.value
    this.applyFilter()
  }

  openIssue(issue: SupportIssue) {
    // Clear unread count when opening issue
    this.unreadCounts.delete(issue._id)
    
    if (issue.status === 'FEEDBACK_PENDING') {
      this.router.navigate(['/support-feedback', issue._id])
    } else if (issue.status === 'RESOLVED' || issue.status === 'ESCALATED') {
      // Show resolved issue details
      this.showResolvedIssue(issue)
    } else {
      this.router.navigate(['/support-chat', issue._id])
    }
  }

  setupSocketListeners() {
    // Listen for unread count updates
    const unreadSub = this.socketService.on<{ issueId: string; unreadCount: number }>('support:unread_count').subscribe((data) => {
      this.unreadCounts.set(data.issueId, data.unreadCount)
    })
    this.subscriptions.push(unreadSub)

    // Listen for status changes
    const statusSub = this.supportService.onStatusChanged().subscribe((data) => {
      // Reload issues when status changes
      if (this.user?.id) {
        this.loadIssues()
      }
    })
    this.subscriptions.push(statusSub)
  }

  getUnreadCount(issueId: string): number {
    return this.unreadCounts.get(issueId) || 0
  }

  async createNewIssue() {
    const alert = await this.alertController.create({
      header: 'Select Issue Type',
      inputs: [
        { name: 'RIDE', type: 'radio', label: 'Ride Related', value: 'RIDE' },
        { name: 'PAYMENT', type: 'radio', label: 'Payment Issue', value: 'PAYMENT' },
        { name: 'ACCOUNT', type: 'radio', label: 'Account Issue', value: 'ACCOUNT' },
        { name: 'GENERAL', type: 'radio', label: 'General Inquiry', value: 'GENERAL', checked: true }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Continue',
          handler: async (issueType) => {
            if (issueType) {
              await this.createIssue(issueType)
            }
          }
        }
      ]
    })
    await alert.present()
  }

  async createIssue(issueType: string) {
    if (!this.user?.id) return

    const loading = await this.loadingController.create({
      message: 'Connecting to support...'
    })
    await loading.present()

    try {
      const sub = this.supportService.createIssue(this.user.id, issueType as any).subscribe({
        next: async (issue) => {
          await loading.dismiss()
          // Request support via socket
          this.supportService.requestSupport(this.user.id, issueType as any)
          this.router.navigate(['/support-chat', issue._id])
        },
        error: async (error) => {
          await loading.dismiss()
          console.error('Error creating issue:', error)
          
          if (error.error?.message?.includes('already have an active')) {
            const alert = await this.alertController.create({
              header: 'Active Support Chat',
              message: error.error.message,
              buttons: [
                {
                  text: 'Open Chat',
                  handler: () => {
                    if (error.error.issueId) {
                      this.router.navigate(['/support-chat', error.error.issueId])
                    }
                  }
                },
                { text: 'OK' }
              ]
            })
            await alert.present()
          } else {
            const toast = await this.toastController.create({
              message: 'Failed to create support request',
              duration: 2000,
              color: 'danger'
            })
            await toast.present()
          }
        }
      })
      this.subscriptions.push(sub)
    } catch (error) {
      await loading.dismiss()
    }
  }

  async showResolvedIssue(issue: SupportIssue) {
    const alert = await this.alertController.create({
      header: 'Resolved Issue',
      message: `Issue ID: ${issue._id}\nStatus: ${issue.status}\nResolved: ${issue.resolvedAt ? new Date(issue.resolvedAt).toLocaleString() : 'N/A'}`,
      buttons: ['OK']
    })
    await alert.present()
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'WAITING_FOR_ADMIN':
        return 'warning'
      case 'CHAT_ACTIVE':
        return 'primary'
      case 'FEEDBACK_PENDING':
        return 'tertiary'
      case 'RESOLVED':
        return 'success'
      case 'ESCALATED':
        return 'danger'
      default:
        return 'medium'
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'WAITING_FOR_ADMIN':
        return 'Waiting for Admin'
      case 'ADMIN_ASSIGNED':
        return 'Admin Assigned'
      case 'CHAT_ACTIVE':
        return 'Active Chat'
      case 'FEEDBACK_PENDING':
        return 'Feedback Pending'
      case 'RESOLVED':
        return 'Resolved'
      case 'ESCALATED':
        return 'Escalated'
      default:
        return status
    }
  }

  getIssueTypeIcon(issueType: string): string {
    switch (issueType) {
      case 'RIDE':
        return 'car-outline'
      case 'PAYMENT':
        return 'card-outline'
      case 'ACCOUNT':
        return 'person-outline'
      default:
        return 'help-circle-outline'
    }
  }
}
