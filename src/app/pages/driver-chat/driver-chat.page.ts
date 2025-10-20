import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { Router } from '@angular/router';
import { RideService, Ride } from 'src/app/services/ride.service';
import { SocketService } from 'src/app/services/socket.service';
import { Subscription } from 'rxjs';

interface ChatMessage {
  _id?: string;
  text: string;
  time: string;
  image?: string;
  sender: 'user' | 'driver';
  isRead?: boolean;
  createdAt?: string;
}

@Component({
  selector: 'app-driver-chat',
  templateUrl: './driver-chat.page.html',
  styleUrls: ['./driver-chat.page.scss'],
  standalone: false,
})
export class DriverChatPage implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;

  messages: ChatMessage[] = [];
  newMessage: string = '';
  currentRide: Ride | null = null;
  driverName: string = 'Driver';

  private messageSubscription?: Subscription;
  private messagesSubscription?: Subscription;
  private messageSentSubscription?: Subscription;

  constructor(
    private router: Router,
    private rideService: RideService,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    // Get current ride
    this.currentRide = this.rideService.getCurrentRideValue();

    if (this.currentRide && this.currentRide.driver) {
      this.driverName = this.currentRide.driver.name;

      // Load existing messages
      this.rideService.getRideMessages(this.currentRide._id);
    }

    // Listen for incoming messages
    this.messageSubscription = this.socketService
      .on<any>('receiveMessage')
      .subscribe((message) => {
        console.log('📨 Received message:', message);
        this.addMessage({
          _id: message._id,
          text: message.message,
          time: this.formatTime(message.createdAt),
          sender: 'driver',
          isRead: message.isRead,
          createdAt: message.createdAt,
        });
      });

    // Listen for chat history
    this.messagesSubscription = this.socketService
      .on<any[]>('rideMessages')
      .subscribe((messages) => {
        console.log('📚 Loading chat history:', messages);
        this.messages = messages.map((msg) => ({
          _id: msg._id,
          text: msg.message,
          time: this.formatTime(msg.createdAt),
          sender: msg.senderModel === 'User' ? 'user' : 'driver',
          isRead: msg.isRead,
          createdAt: msg.createdAt,
        }));
      });

    // Listen for message sent confirmation
    this.messageSentSubscription = this.socketService
      .on<any>('messageSent')
      .subscribe((data) => {
        console.log('✅ Message sent successfully:', data);
      });
  }

  ngOnDestroy() {
    this.messageSubscription?.unsubscribe();
    this.messagesSubscription?.unsubscribe();
    this.messageSentSubscription?.unsubscribe();
  }

  private formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private addMessage(message: ChatMessage) {
    this.messages.push(message);
    setTimeout(() => this.scrollToBottom(), 100);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop =
        this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  sendMessage() {
    if (this.newMessage.trim() && this.currentRide) {
      const messageText = this.newMessage.trim();
      const now = new Date();
      const time = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Add message to UI immediately (optimistic update)
      this.addMessage({
        text: messageText,
        time: time,
        sender: 'user',
      });

      // Send via Socket.IO
      this.rideService.sendMessage(messageText);

      this.newMessage = '';
    }
  }

  openImagePicker() {
    // In a real app, implement image picker functionality
    console.log('Opening image picker...');
  }

  openImage(imageUrl: string) {
    // In a real app, implement image preview functionality
    console.log('Opening image:', imageUrl);
  }

  goBack() {
    this.router.navigate(['/driver-details']);
  }
}
