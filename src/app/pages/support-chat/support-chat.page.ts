import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AlertController, LoadingController, ToastController } from '@ionic/angular'
import { SupportService, SupportIssue, SupportMessage } from '../../services/support.service'
import { UserService } from '../../services/user.service'
import { Subscription, Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-support-chat',
  templateUrl: './support-chat.page.html',
  styleUrls: ['./support-chat.page.scss'],
  standalone: false,
})
export class SupportChatPage implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer', { static: false }) private messageContainer!: ElementRef

  issueId: string = ''
  issue: SupportIssue | null = null
  messages: SupportMessage[] = []
  newMessage: string = ''
  user: any
  isLoading = false
  isSending = false
  isAdminTyping = false
  private subscriptions: Subscription[] = []
  private shouldScroll = false
  private typingSubject = new Subject<boolean>()
  private typingTimeout: any = null
  private hasJoinedRoom = false
  private lastMessageId: string | null = null
  private previousMessageCount: number = 0
  private scrollTimeout: any = null

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supportService: SupportService,
    private userService: UserService,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.issueId = this.route.snapshot.paramMap.get('issueId') || ''
    this.setupTypingDebounce()
    this.loadUser()
  }

  ngAfterViewChecked() {
    // Check if message count changed (new message arrived)
    if (this.messages.length !== this.previousMessageCount) {
      this.previousMessageCount = this.messages.length
      // Always scroll when new message arrives
      this.scrollToBottom(true)
    } else if (this.shouldScroll) {
      // Scroll for other reasons (typing indicator, etc.)
      this.scrollToBottom(true)
      this.shouldScroll = false
    }
  }

  ngOnDestroy() {
    // Clear typing status when leaving
    if (this.issueId) {
      this.supportService.emitTyping(this.issueId, false)
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout)
    }
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
    }
    this.subscriptions.forEach(sub => sub.unsubscribe())
  }

  private setupTypingDebounce() {
    // Debounce typing events to avoid flooding the server
    const typingSub = this.typingSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(isTyping => {
      this.supportService.emitTyping(this.issueId, isTyping)
    })
    this.subscriptions.push(typingSub)
  }

  loadUser() {
    const sub = this.userService.getUser().subscribe(user => {
      this.user = user
      if (user?.id && this.issueId) {
        this.joinChatRoom()
        this.loadIssue()
        this.loadMessages()
        this.setupSocketListeners()
      }
    })
    this.subscriptions.push(sub)
  }

  private joinChatRoom() {
    if (this.hasJoinedRoom || !this.user?.id || !this.issueId) return
    
    // Join the socket room for real-time messages
    this.supportService.joinChat(this.issueId, this.user.id)
    this.hasJoinedRoom = true
    console.log('📢 Joining support chat room:', this.issueId)
  }

  async loadIssue() {
    if (!this.user?.id || !this.issueId) return

    this.isLoading = true
    try {
      const sub = this.supportService.getIssueById(this.user.id, this.issueId).subscribe({
        next: (issue) => {
          this.issue = issue
          this.supportService.setCurrentIssue(issue)
          this.isLoading = false
        },
        error: async (error) => {
          console.error('Error loading issue:', error)
          this.isLoading = false
          const toast = await this.toastController.create({
            message: 'Failed to load support issue',
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

  async loadMessages() {
    if (!this.user?.id || !this.issueId) return

    try {
      const sub = this.supportService.getIssueMessages(this.user.id, this.issueId).subscribe({
        next: (messages) => {
          this.messages = messages
          this.supportService.setMessages(messages)
          if (messages.length > 0) {
            this.lastMessageId = messages[messages.length - 1]._id
          }
          this.previousMessageCount = messages.length
          // AfterViewChecked will handle scrolling
        },
        error: (error) => {
          console.error('Error loading messages:', error)
        }
      })
      this.subscriptions.push(sub)
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  setupSocketListeners() {
    // Listen for chat join confirmation
    const joinedSub = this.supportService.onJoined().subscribe((data: any) => {
      if (data.issueId === this.issueId) {
        console.log('✅ Successfully joined support chat room')
      }
    })
    this.subscriptions.push(joinedSub)

    // Listen for new messages
    const messageSub = this.supportService.onSupportMessage().subscribe((message: SupportMessage) => {
      if (message.issueId === this.issueId || message.issueId?.toString() === this.issueId) {
        // Check if message already exists to prevent duplicates
        const messageExists = this.messages.some(m => m._id === message._id || 
          (m._id?.toString().startsWith('temp_') && m.message === message.message && 
           Math.abs(new Date(m.createdAt).getTime() - new Date(message.createdAt).getTime()) < 5000))
        
        if (!messageExists) {
          this.messages.push(message)
          this.supportService.addMessage(message)
          this.lastMessageId = message._id
          // Clear admin typing indicator when message received
          if (message.senderType === 'ADMIN') {
            this.isAdminTyping = false
          }
          this.cdr.detectChanges()
          // AfterViewChecked will handle scrolling when message count changes
        }
      }
    })
    this.subscriptions.push(messageSub)

    // Listen for typing indicators
    const typingSub = this.supportService.onTyping().subscribe((data: any) => {
      if (data.issueId === this.issueId && data.senderType === 'ADMIN') {
        this.isAdminTyping = data.isTyping
        this.cdr.detectChanges()
        
        // Scroll to bottom when typing indicator appears/disappears
        setTimeout(() => {
          this.scrollToBottom(true)
        }, 100)
        
        // Auto-hide typing indicator after 5 seconds (in case stop typing event is missed)
        if (data.isTyping) {
          if (this.typingTimeout) {
            clearTimeout(this.typingTimeout)
          }
          this.typingTimeout = setTimeout(() => {
            this.isAdminTyping = false
            this.cdr.detectChanges()
            // Scroll when typing indicator disappears
            setTimeout(() => {
              this.scrollToBottom(true)
            }, 100)
          }, 5000)
        }
      }
    })
    this.subscriptions.push(typingSub)

    // Listen for status changes
    const statusSub = this.supportService.onStatusChanged().subscribe((data: any) => {
      if (data.issueId === this.issueId || data.issueId?.toString() === this.issueId) {
        // Reload issue to get updated status
        if (this.user?.id) {
          this.loadIssue()
          
          // If status changed to FEEDBACK_PENDING, navigate to feedback page
          if (data.status === 'FEEDBACK_PENDING' && this.issue?.status !== 'FEEDBACK_PENDING') {
            setTimeout(() => {
              this.router.navigate(['/support-feedback', this.issueId])
            }, 1000)
          }
        }
      }
    })
    this.subscriptions.push(statusSub)

    // Listen for support connected
    const connectedSub = this.supportService.onSupportConnected().subscribe((data: any) => {
      if (data.issueId === this.issueId) {
        this.loadIssue() // Reload to get updated status
      }
    })
    this.subscriptions.push(connectedSub)

    // Listen for support ended
    const endedSub = this.supportService.onSupportEnded().subscribe((data: any) => {
      if (data.issueId === this.issueId) {
        this.isAdminTyping = false
        this.loadIssue() // Reload to get updated status
        this.showFeedbackPrompt()
      }
    })
    this.subscriptions.push(endedSub)

    // Listen for admin disconnected
    const adminDisconnectedSub = this.supportService.onAdminDisconnected().subscribe((data: any) => {
      if (data.issueId === this.issueId) {
        this.isAdminTyping = false
        this.showToast('Support agent disconnected. Reconnecting...')
        this.loadIssue()
      }
    })
    this.subscriptions.push(adminDisconnectedSub)
  }

  // Handle input changes for typing indicator
  onMessageInput() {
    if (this.newMessage.trim()) {
      this.typingSubject.next(true)
    } else {
      this.typingSubject.next(false)
    }
  }

  async sendMessage() {
    if (!this.newMessage.trim() || this.isSending) return

    const messageText = this.newMessage.trim()
    this.newMessage = ''
    this.isSending = true

    // Stop typing indicator
    this.typingSubject.next(false)

    try {
      // Send via socket
      this.supportService.sendMessage(this.issueId, messageText)

      // Optimistically add message
      const tempMessage: SupportMessage = {
        _id: 'temp_' + Date.now(),
        issueId: this.issueId,
        senderType: 'USER',
        senderId: this.user?.id,
        message: messageText,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      this.messages.push(tempMessage)
      this.lastMessageId = tempMessage._id
      this.cdr.detectChanges()
      // AfterViewChecked will handle scrolling when message count changes

      this.isSending = false
    } catch (error) {
      console.error('Error sending message:', error)
      this.isSending = false
      this.newMessage = messageText // Restore message on error
      const toast = await this.toastController.create({
        message: 'Failed to send message',
        duration: 2000,
        color: 'danger'
      })
      await toast.present()
    }
  }

  async provideFeedback(issueId: string) {
     this.router.navigate(['/support-feedback', issueId])
  }

  async showFeedbackPrompt() {
    const alert = await this.alertController.create({
      header: 'Chat Resolved',
      message: 'Your support chat has been resolved. Please provide your feedback.',
      buttons: [
        {
          text: 'Provide Feedback',
          handler: () => {
            this.router.navigate(['/support-feedback', this.issueId])
          }
        },
        {
          text: 'Later',
          role: 'cancel'
        }
      ]
    })
    await alert.present()
  }

  // Professional scroll to bottom implementation
  scrollToBottom(force: boolean = false): void {
    // Clear any pending scroll timeout
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = null
    }

    try {
      if (!this.messageContainer?.nativeElement) {
        // Retry after a short delay if container not ready
        this.scrollTimeout = setTimeout(() => this.scrollToBottom(force), 100)
        return
      }
      
      const container = this.messageContainer.nativeElement
      
      // If force is true, always scroll regardless of position
      // If force is false, only scroll if user is near bottom
      if (!force) {
        const scrollHeight = container.scrollHeight
        const clientHeight = container.clientHeight
        const scrollTop = container.scrollTop
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
        
        if (!isNearBottom) {
          return // User scrolled up, don't auto-scroll
        }
      }

      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        try {
          // Strategy 1: Direct scrollTop assignment (immediate)
          container.scrollTop = container.scrollHeight
          
          // Strategy 2: Retry after DOM updates (50ms)
          this.scrollTimeout = setTimeout(() => {
            if (container && this.messageContainer?.nativeElement) {
              container.scrollTop = container.scrollHeight
              
              // Strategy 3: Second retry (100ms)
              this.scrollTimeout = setTimeout(() => {
                if (container && this.messageContainer?.nativeElement) {
                  container.scrollTop = container.scrollHeight
                  
                  // Strategy 4: Verify scroll happened and retry if needed (200ms)
                  this.scrollTimeout = setTimeout(() => {
                    if (container && this.messageContainer?.nativeElement) {
                      const currentScrollTop = container.scrollTop
                      const maxScroll = container.scrollHeight - container.clientHeight
                      const distanceFromBottom = maxScroll - currentScrollTop
                      
                      // If not at bottom (within 10px), retry
                      if (distanceFromBottom > 10) {
                        container.scrollTop = container.scrollHeight
                      }
                    }
                  }, 200)
                }
              }, 100)
            }
          }, 50)
          
          // Strategy 5: Fallback using scrollIntoView (300ms)
          this.scrollTimeout = setTimeout(() => {
            if (container && this.messageContainer?.nativeElement) {
              const messages = container.querySelectorAll('.message-wrapper')
              if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1] as HTMLElement
                const typingIndicator = container.querySelector('.typing-indicator')
                const targetElement = typingIndicator || lastMessage
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'end' })
              } else {
                // No messages, scroll container itself
                container.scrollTop = container.scrollHeight
              }
            }
          }, 300)
        } catch (err) {
          console.error('Error in scroll animation:', err)
        }
      })
    } catch (err) {
      console.error('Error scrolling to bottom:', err)
    }
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'medium'
    })
    await toast.present()
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'WAITING_FOR_ADMIN':
        return 'Waiting for support agent...'
      case 'ADMIN_ASSIGNED':
        return 'Support agent assigned'
      case 'CHAT_ACTIVE':
        return 'Chat active'
      case 'FEEDBACK_PENDING':
        return 'Please provide feedback'
      case 'RESOLVED':
        return 'Resolved'
      default:
        return status
    }
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
      default:
        return 'medium'
    }
  }

  isUserMessage(message: SupportMessage): boolean {
    return message.senderType === 'USER'
  }

  isSystemMessage(message: SupportMessage): boolean {
    return message.senderType === 'SYSTEM'
  }

  async refreshChat() {
    if (this.user?.id && this.issueId) {
      // Re-join room on refresh
      this.joinChatRoom()
      await this.loadIssue()
      await this.loadMessages()
    }
  }
}
