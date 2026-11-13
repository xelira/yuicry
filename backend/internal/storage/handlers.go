package storage

import (
	"context"

	"google.golang.org/grpc"
)

func sizeHandler(server any, ctx context.Context, decode func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	request := new(SizeRequest)
	if err := decode(request); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return server.(Service).Size(ctx, request)
	}
	info := &grpc.UnaryServerInfo{Server: server, FullMethod: "/yuicry.storage/Size"}
	call := func(ctx context.Context, value any) (any, error) {
		return server.(Service).Size(ctx, value.(*SizeRequest))
	}
	return interceptor(ctx, request, info, call)
}

func readAtHandler(server any, ctx context.Context, decode func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	request := new(ReadRequest)
	if err := decode(request); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return server.(Service).ReadAt(ctx, request)
	}
	info := &grpc.UnaryServerInfo{Server: server, FullMethod: "/yuicry.storage/ReadAt"}
	call := func(ctx context.Context, value any) (any, error) {
		return server.(Service).ReadAt(ctx, value.(*ReadRequest))
	}
	return interceptor(ctx, request, info, call)
}

func putHandler(server any, ctx context.Context, decode func(any) error, interceptor grpc.UnaryServerInterceptor) (any, error) {
	request := new(PutRequest)
	if err := decode(request); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return server.(Service).Put(ctx, request)
	}
	info := &grpc.UnaryServerInfo{Server: server, FullMethod: "/yuicry.storage/Put"}
	call := func(ctx context.Context, value any) (any, error) {
		return server.(Service).Put(ctx, value.(*PutRequest))
	}
	return interceptor(ctx, request, info, call)
}
