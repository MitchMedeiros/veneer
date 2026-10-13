#import <Foundation/Foundation.h>
#include <vector>
#include <string>

// objective-c++ mixes both
@interface Counter : NSObject
- (void)add:(int)n;
@end

@implementation Counter {
    std::vector<int> _values;
}
- (void)add:(int)n {
    _values.push_back(n);
    NSLog(@"count: %lu", (unsigned long)_values.size());
}
@end

template <typename T>
T twice(T x) { return x * 2; }

int main() {
    std::string s = "text";
    Counter *c = [Counter new];
    [c add:twice(21)];
    return 0;
}
