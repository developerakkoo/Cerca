import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { Router } from '@angular/router';

interface ChatMessage {
  text: string;
  time: string;
  image?: string;
}

@Component({
  selector: 'app-driver-chat',
  templateUrl: './driver-chat.page.html',
  styleUrls: ['./driver-chat.page.scss'],
  standalone: false,
})
export class DriverChatPage implements OnInit, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;

  messages: ChatMessage[] = [
    {
      text: 'Hello! I\'m your driver. I\'ll be there in 5 minutes.',
      time: '10:30 AM'
    },
    {
      text: 'I\'m waiting at the pickup location.',
      time: '10:35 AM'
    }
  ];

  userMessages: ChatMessage[] = [
    {
      text: 'Hi! Thanks for the update.',
      time: '10:31 AM'
    }
  ];

  newMessage: string = '';

  constructor(private router: Router) {}

  ngOnInit() {
    // In a real app, you would initialize chat connection here
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  sendMessage() {
    if (this.newMessage.trim()) {
      const now = new Date();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      this.userMessages.push({
        text: this.newMessage,
        time: time
      });

      this.newMessage = '';

      // Simulate driver response after 1 second
      setTimeout(() => {
        this.messages.push({
          text: 'Thanks for your message! I\'ll keep you updated.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }, 1000);
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
