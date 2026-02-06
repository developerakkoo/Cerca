import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeNewPage } from './home-new.page';

describe('HomeNewPage', () => {
  let component: HomeNewPage;
  let fixture: ComponentFixture<HomeNewPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HomeNewPage]
    });
    fixture = TestBed.createComponent(HomeNewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

