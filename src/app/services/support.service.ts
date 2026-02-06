import { Injectable } from '@angular/core'
import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Observable, BehaviorSubject, throwError } from 'rxjs'
import { catchError, map, retry } from 'rxjs/operators'
import { environment } from 'src/environments/environment'
import { SocketService } from './socket.service'
import { Storage } from '@ionic/storage-angular'

export interface SupportIssue {
  _id: string
  userId: string
  adminId?: string
  issueType: 'RIDE' | 'PAYMENT' | 'ACCOUNT' | 'GENERAL'
  status: 'WAITING_FOR_ADMIN' | 'ADMIN_ASSIGNED' | 'CHAT_ACTIVE' | 'FEEDBACK_PENDING' | 'RESOLVED' | 'ESCALATED'
  escalated?: boolean
  resolvedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface SupportMessage {
  _id: string
  issueId: string
  senderType: 'USER' | 'ADMIN' | 'SYSTEM'
  senderId?: string
  message: string
  createdAt: Date
  updatedAt: Date
}

export interface SupportFeedback {
  issueId: string
  resolved: boolean
  rating?: number
  comment?: string
}

@Injectable({
  providedIn: 'root'
})
export class SupportService {
  private apiUrl = `${environment.apiUrl}/users`
  private currentIssue$ = new BehaviorSubject<SupportIssue | null>(null)
  private messages$ = new BehaviorSubject<SupportMessage[]>([])

  constructor(
    private http: HttpClient,
    private socketService: SocketService,
    private storage: Storage
  ) {}

  /**
   * Get all support issues for the current user
   */
  getUserIssues(userId: string): Observable<SupportIssue[]> {
    return this.http.get<SupportIssue[]>(`${this.apiUrl}/${userId}/support/issues`).pipe(
      catchError(this.handleError)
    )
  }

  /**
   * Get issue by ID
   */
  getIssueById(userId: string, issueId: string): Observable<SupportIssue> {
    return this.http.get<SupportIssue>(`${this.apiUrl}/${userId}/support/issues/${issueId}`).pipe(
      catchError(this.handleError)
    )
  }

  /**
   * Get messages for an issue
   */
  getIssueMessages(userId: string, issueId: string): Observable<SupportMessage[]> {
    return this.http.get<SupportMessage[]>(`${this.apiUrl}/${userId}/support/issues/${issueId}/messages`).pipe(
      catchError(this.handleError)
    )
  }

  /**
   * Create a new support issue
   */
  createIssue(userId: string, issueType: 'RIDE' | 'PAYMENT' | 'ACCOUNT' | 'GENERAL'): Observable<SupportIssue> {
    return this.http.post<SupportIssue>(`${this.apiUrl}/${userId}/support/issues`, { issueType }).pipe(
      catchError(this.handleError)
    )
  }

  /**
   * Submit feedback for a resolved issue
   */
  submitFeedback(
    userId: string,
    issueId: string,
    rating: number,
    comment: string,
    resolved: boolean
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/${userId}/support/issues/${issueId}/feedback`, {
      rating,
      comment,
      resolved
    }).pipe(
      catchError(this.handleError)
    )
  }

  /**
   * Request support via Socket.IO
   */
  requestSupport(userId: string, issueType: 'RIDE' | 'PAYMENT' | 'ACCOUNT' | 'GENERAL'): void {
    this.socketService.emit('support:request', { userId, issueType })
  }

  /**
   * Send message via Socket.IO
   */
  sendMessage(issueId: string, message: string): void {
    this.socketService.emit('support:message', { issueId, message })
  }

  /**
   * Join a support chat room via Socket.IO
   */
  joinChat(issueId: string, userId: string): void {
    this.socketService.emit('support:join_chat', { issueId, userId })
  }

  /**
   * Emit typing status via Socket.IO
   */
  emitTyping(issueId: string, isTyping: boolean): void {
    this.socketService.emit('support:typing', { issueId, isTyping })
  }

  /**
   * Listen for typing indicator events
   */
  onTyping(): Observable<{ issueId: string; senderType: 'USER' | 'ADMIN'; isTyping: boolean }> {
    return this.socketService.on<{ issueId: string; senderType: 'USER' | 'ADMIN'; isTyping: boolean }>('support:typing')
  }

  /**
   * Listen for chat join confirmation
   */
  onJoined(): Observable<{ issueId: string; status: string }> {
    return this.socketService.on<{ issueId: string; status: string }>('support:joined')
  }

  /**
   * Listen for support waiting event
   */
  onSupportWaiting(): Observable<any> {
    return this.socketService.on('support:waiting')
  }

  /**
   * Listen for support connected event
   */
  onSupportConnected(): Observable<any> {
    return this.socketService.on('support:connected')
  }

  /**
   * Listen for new messages
   */
  onSupportMessage(): Observable<SupportMessage> {
    return this.socketService.on<SupportMessage>('support:message')
  }

  /**
   * Listen for support ended event
   */
  onSupportEnded(): Observable<any> {
    return this.socketService.on('support:ended')
  }

  /**
   * Listen for status changed event
   */
  onStatusChanged(): Observable<{ issueId: string; status: string }> {
    return this.socketService.on<{ issueId: string; status: string }>('support:status_changed')
  }

  /**
   * Listen for admin disconnected event
   */
  onAdminDisconnected(): Observable<any> {
    return this.socketService.on('support:admin_disconnected')
  }

  /**
   * Listen for already active support
   */
  onAlreadyActive(): Observable<any> {
    return this.socketService.on('support:already_active')
  }

  /**
   * Get current issue
   */
  getCurrentIssue(): Observable<SupportIssue | null> {
    return this.currentIssue$.asObservable()
  }

  /**
   * Set current issue
   */
  setCurrentIssue(issue: SupportIssue | null): void {
    this.currentIssue$.next(issue)
  }

  /**
   * Get messages
   */
  getMessages(): Observable<SupportMessage[]> {
    return this.messages$.asObservable()
  }

  /**
   * Set messages
   */
  setMessages(messages: SupportMessage[]): void {
    this.messages$.next(messages)
  }

  /**
   * Add message to messages array
   */
  addMessage(message: SupportMessage): void {
    const currentMessages = this.messages$.value
    this.messages$.next([...currentMessages, message])
  }

  /**
   * Error handler
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred'
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`
    } else {
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message || error.error?.message || errorMessage}`
    }
    console.error('Support Service Error:', errorMessage)
    return throwError(() => new Error(errorMessage))
  }
}

