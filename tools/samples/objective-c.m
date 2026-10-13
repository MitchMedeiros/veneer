#import <Foundation/Foundation.h>

// a small class
@interface Person : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic, assign) NSInteger age;
- (instancetype)initWithName:(NSString *)name age:(NSInteger)age;
@end

@implementation Person
- (instancetype)initWithName:(NSString *)name age:(NSInteger)age {
    if ((self = [super init])) {
        _name = [name copy];
        _age = age;
    }
    return self;
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        Person *p = [[Person alloc] initWithName:@"Ann" age:30];
        NSLog(@"%@ is %ld", p.name, (long)p.age);
    }
    return 0;
}
